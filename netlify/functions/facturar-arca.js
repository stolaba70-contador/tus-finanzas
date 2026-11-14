const { createClient } = require('@supabase/supabase-js');
const forge = require('node-forge');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function normalizarPem(valor) {
  if (!valor || typeof valor !== 'string') return '';
  return valor
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim() + '\n';
}

function decodificarXml(texto) {
  return String(texto || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function firmarTRA(certPem, keyPem) {
  const certLimpio = normalizarPem(certPem);
  const keyLimpia = normalizarPem(keyPem);

  const cert = forge.pki.certificateFromPem(certLimpio);
  const privateKey = forge.pki.privateKeyFromPem(keyLimpia);

  const ahora = new Date();
  const genTime = new Date(ahora.getTime() - 10 * 60 * 1000).toISOString();
  const expTime = new Date(ahora.getTime() + 10 * 60 * 1000).toISOString();
  const uniqueId = Math.floor(ahora.getTime() / 1000);

  const traXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0">` +
    `<header>` +
    `<uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${genTime}</generationTime>` +
    `<expirationTime>${expTime}</expirationTime>` +
    `</header>` +
    `<service>wsfe</service>` +
    `</loginTicketRequest>`;

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() }
    ]
  });
  p7.sign();

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

async function obtenerTokenYSigArca(certPem, keyPem) {
  const cmsBase64 = firmarTRA(certPem, keyPem);

  const soapEnvelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<wsaa:loginCms>` +
    `<wsaa:in0>${cmsBase64}</wsaa:in0>` +
    `</wsaa:loginCms>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`;

  const res = await fetch('https://wsaa.afip.gov.ar/ws/services/LoginCms', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '""'
    },
    body: soapEnvelope,
    signal: AbortSignal.timeout(8000)
  });

  const rawText = await res.text();
  const xmlText = decodificarXml(rawText);

  const faultMatch = xmlText.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
  if (faultMatch) {
    throw new Error(`WSAA Fault: ${faultMatch[1].trim()}`);
  }

  const tokenMatch = xmlText.match(/<token>([\s\S]*?)<\/token>/i);
  const signMatch = xmlText.match(/<sign>([\s\S]*?)<\/sign>/i);

  if (!tokenMatch || !signMatch) {
    throw new Error(`WSAA sin token/sign (HTTP ${res.status}): ${xmlText.slice(0, 240)}`);
  }

  return {
    token: tokenMatch[1].trim(),
    sign: signMatch[1].trim()
  };
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Método no permitido' })
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { organizacionId, montoTotal, docTipo, docNro } = body;

    if (!organizacionId || !montoTotal || Number(montoTotal) <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Faltan datos de organización o monto de venta' })
      };
    }

    const { data: org, error: orgError } = await supabase
      .from('organizaciones')
      .select('cuit, punto_venta, afip_cert, afip_key')
      .eq('id', organizacionId)
      .single();

    if (orgError || !org || !org.cuit || !org.afip_cert || !org.afip_key) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Falta vincular CUIT, certificado (.crt) o clave privada (.key) en Config'
        })
      };
    }

    const cuit = String(org.cuit).replace(/\D/g, '');
    const ptoVta = Number(org.punto_venta) || 3;
    const cbteTipo = 11; // 11 = Factura C

    const { token, sign } = await obtenerTokenYSigArca(org.afip_cert, org.afip_key);

    const soapUltimo =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body>` +
      `<FECompUltimoAutorizado xmlns="http://ar.gov.afip.dif.FEV1/">` +
      `<Auth>` +
      `<Token>${token}</Token>` +
      `<Sign>${sign}</Sign>` +
      `<Cuit>${cuit}</Cuit>` +
      `</Auth>` +
      `<PtoVta>${ptoVta}</PtoVta>` +
      `<CbteTipo>${cbteTipo}</CbteTipo>` +
      `</FECompUltimoAutorizado>` +
      `</soap:Body>` +
      `</soap:Envelope>`;

    const resUltimo = await fetch('https://servicios1.afip.gov.ar/wsfev1/service.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado'
      },
      body: soapUltimo,
      signal: AbortSignal.timeout(8000)
    });

    const xmlUltimo = decodificarXml(await resUltimo.text());
    const faultUltimo = xmlUltimo.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
    if (faultUltimo) {
      throw new Error(`WSFE UltimoComprobante: ${faultUltimo[1].trim()}`);
    }

    const errUltimo = xmlUltimo.match(/<Err>[\s\S]*?<Code>(\d+)<\/Code>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>[\s\S]*?<\/Err>/i);
    if (errUltimo) {
      throw new Error(`ARCA ${errUltimo[1]}: ${errUltimo[2].trim()}`);
    }

    const ultimoMatch = xmlUltimo.match(/<CbteNro>(\d+)<\/CbteNro>/i);
    const ultimoNro = ultimoMatch ? parseInt(ultimoMatch[1], 10) : 0;
    const nuevoNumero = ultimoNro + 1;

    const fechaHoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .split('T')[0]
      .replace(/-/g, '');

    const tipoDocumento = Number(docTipo) || 99;
    const nroDocumento = tipoDocumento === 99 ? 0 : Number(String(docNro || '0').replace(/\D/g, ''));
    const condicionIvaReceptor = tipoDocumento === 80 ? 6 : 5;
    const importeFormateado = Number(montoTotal).toFixed(2);

    // Orden estricto de elementos XSD en FECAEDetRequest
    const soapSolicitar =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body>` +
      `<FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">` +
      `<Auth>` +
      `<Token>${token}</Token>` +
      `<Sign>${sign}</Sign>` +
      `<Cuit>${cuit}</Cuit>` +
      `</Auth>` +
      `<FeCAEReq>` +
      `<FeCabReq>` +
      `<CantReg>1</CantReg>` +
      `<PtoVta>${ptoVta}</PtoVta>` +
      `<CbteTipo>${cbteTipo}</CbteTipo>` +
      `</FeCabReq>` +
      `<FeDetReq>` +
      `<FECAEDetRequest>` +
      `<Concepto>1</Concepto>` +
      `<DocTipo>${tipoDocumento}</DocTipo>` +
      `<DocNro>${nroDocumento}</DocNro>` +
      `<CbteDesde>${nuevoNumero}</CbteDesde>` +
      `<CbteHasta>${nuevoNumero}</CbteHasta>` +
      `<CbteFch>${fechaHoy}</CbteFch>` +
      `<ImpTotal>${importeFormateado}</ImpTotal>` +
      `<ImpTotConc>0.00</ImpTotConc>` +
      `<ImpNeto>${importeFormateado}</ImpNeto>` +
      `<ImpOpEx>0.00</ImpOpEx>` +
      `<ImpTrib>0.00</ImpTrib>` +
      `<ImpIVA>0.00</ImpIVA>` +
      `<MonId>PES</MonId>` +
      `<MonCotiz>1</MonCotiz>` +
      `<CondicionIVAReceptorId>${condicionIvaReceptor}</CondicionIVAReceptorId>` +
      `</FECAEDetRequest>` +
      `</FeDetReq>` +
      `</FeCAEReq>` +
      `</FECAESolicitar>` +
      `</soap:Body>` +
      `</soap:Envelope>`;

    const resSolicitar = await fetch('https://servicios1.afip.gov.ar/wsfev1/service.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAESolicitar'
      },
      body: soapSolicitar,
      signal: AbortSignal.timeout(8000)
    });

    const xmlSolicitar = decodificarXml(await resSolicitar.text());
    const faultSolicitar = xmlSolicitar.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
    if (faultSolicitar) {
      throw new Error(`WSFE FECAESolicitar: ${faultSolicitar[1].trim()}`);
    }

    const errGlobal = xmlSolicitar.match(/<Err>[\s\S]*?<Code>(\d+)<\/Code>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>[\s\S]*?<\/Err>/i);
    if (errGlobal) {
      throw new Error(`ARCA ${errGlobal[1]}: ${errGlobal[2].trim()}`);
    }

    const obsDet = xmlSolicitar.match(/<Obs>[\s\S]*?<Code>(\d+)<\/Code>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>[\s\S]*?<\/Obs>/i);
    const resultadoMatch = xmlSolicitar.match(/<Resultado>([A-Z])<\/Resultado>/i);
    const caeMatch = xmlSolicitar.match(/<CAE>(\d+)<\/CAE>/i);
    const vtoMatch = xmlSolicitar.match(/<CAEFchVto>(\d+)<\/CAEFchVto>/i);

    if (!caeMatch || (resultadoMatch && resultadoMatch[1].toUpperCase() !== 'A')) {
      const detalleRechazo = obsDet
        ? `Obs ${obsDet[1]}: ${obsDet[2].trim()}`
        : 'ARCA no devolvió CAE';
      throw new Error(detalleRechazo);
    }

    const nroFormateado = `${String(ptoVta).padStart(5, '0')}-${String(nuevoNumero).padStart(8, '0')}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        cae: caeMatch[1],
        vencimientoCae: vtoMatch ? vtoMatch[1] : '',
        nroComprobante: nroFormateado,
        cuitEmisor: cuit,
        puntoVenta: ptoVta,
        numero: nuevoNumero
      })
    };
  } catch (err) {
    console.error('Error en facturar-arca:', err);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        ok: false,
        error: err.message || 'Error inesperado al facturar en ARCA'
      })
    };
  }
};