const { createClient } = require('@supabase/supabase-js');
const forge = require('node-forge');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Firma el Ticket de Requerimiento de Acceso (TRA) en formato CMS/PKCS#7 exigido por WSAA de ARCA
function firmarTRA(certPem, keyPem) {
  const ahora = new Date();
  const genTime = new Date(ahora.getTime() - 600000).toISOString();
  const expTime = new Date(ahora.getTime() + 600000).toISOString();
  const uniqueId = Math.floor(ahora.getTime() / 1000);

  const traXml = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${genTime}</generationTime>
    <expirationTime>${expTime}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`;

  const cert = forge.pki.certificateFromPem(certPem);
  const privateKey = forge.pki.privateKeyFromPem(keyPem);

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
  const asn1 = p7.toAsn1();
  const der = forge.asn1.toDer(asn1).getBytes();
  return forge.util.encode64(der);
}

// Obtiene Token y Sign desde el servidor de Producción de ARCA (WSAA)
async function obtenerTokenYSigArca(certPem, keyPem) {
  const cmsBase64 = firmarTRA(certPem, keyPem);
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cmsBase64}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch('https://wsaa.afip.gov.ar/ws/services/LoginCms', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '' },
    body: soapEnvelope
  });

  const xmlText = await res.text();
  const tokenMatch = xmlText.match(/&lt;token&gt;([\s\S]*?)&lt;\/token&gt;/) || xmlText.match(/<token>([\s\S]*?)<\/token>/);
  const signMatch = xmlText.match(/&lt;sign&gt;([\s\S]*?)&lt;\/sign&gt;/) || xmlText.match(/<sign>([\s\S]*?)<\/sign>/);

  if (!tokenMatch || !signMatch) {
    throw new Error('ARCA rechazó el certificado o aún no fue asociado al WebService wsfe. Respuesta: ' + xmlText.slice(0, 300));
  }

  return { token: tokenMatch[1].trim(), sign: signMatch[1].trim() };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  try {
    const { organizacionId, montoTotal, docTipo, docNro } = JSON.parse(event.body);

    const { data: org, error: orgError } = await supabase
      .from('organizaciones')
      .select('cuit, punto_venta, afip_cert, afip_key')
      .eq('id', organizacionId)
      .single();

    if (orgError || !org || !org.cuit || !org.afip_cert || !org.afip_key) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Falta vincular tu CUIT, Certificado (.crt) y Clave (.key) en la pestaña Config.' })
      };
    }

    const cuit = String(org.cuit).replace(/\D/g, '');
    const ptoVta = Number(org.punto_venta) || 1;
    const cbteTipo = 11; // 11 = Factura C

    // 1. Autenticar en WSAA de ARCA
    const { token, sign } = await obtenerTokenYSigArca(org.afip_cert, org.afip_key);

    // 2. Consultar último comprobante autorizado en WSFEv1 de ARCA
    const soapUltimo = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECompUltimoAutorizado xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>${token}</Token>
        <Sign>${sign}</Sign>
        <Cuit>${cuit}</Cuit>
      </Auth>
      <PtoVta>${ptoVta}</PtoVta>
      <CbteTipo>${cbteTipo}</CbteTipo>
    </FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>`;

    const resUltimo = await fetch('https://servicios1.afip.gov.ar/wsfev1/service.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado'
      },
      body: soapUltimo
    });

    const xmlUltimo = await resUltimo.text();
    const ultimoMatch = xmlUltimo.match(/<CbteNro>(\d+)<\/CbteNro>/);
    const ultimoNro = ultimoMatch ? parseInt(ultimoMatch[1], 10) : 0;
    const nuevoNumero = ultimoNro + 1;

    // 3. Emitir Factura C y solicitar CAE en WSFEv1
    const fechaHoy = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000))
      .toISOString().split('T')[0].replace(/-/g, '');
    const tipoDocumento = Number(docTipo) || 99;
    const nroDocumento = tipoDocumento === 99 ? 0 : Number(docNro || 0);
    const condicionIvaReceptor = tipoDocumento === 80 ? 6 : 5; // RG 5616: 5 = Consumidor Final, 6 = Monotributo
    const importeFormateado = Number(montoTotal).toFixed(2);

    const soapSolicitar = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>${token}</Token>
        <Sign>${sign}</Sign>
        <Cuit>${cuit}</Cuit>
      </Auth>
      <FeCAEReq>
        <FeCabReq>
          <CantReg>1</CantReg>
          <PtoVta>${ptoVta}</PtoVta>
          <CbteTipo>${cbteTipo}</CbteTipo>
        </FeCabReq>
        <FeDetReq>
          <FECAEDetRequest>
            <Concepto>1</Concepto>
            <DocTipo>${tipoDocumento}</DocTipo>
            <DocNro>${nroDocumento}</DocNro>
            <CbteDesde>${nuevoNumero}</CbteDesde>
            <CbteHasta>${nuevoNumero}</CbteHasta>
            <CbteFch>${fechaHoy}</CbteFch>
            <ImpTotal>${importeFormateado}</ImpTotal>
            <ImpTotConc>0.00</ImpTotConc>
            <ImpNeto>${importeFormateado}</ImpNeto>
            <ImpOpEx>0.00</ImpOpEx>
            <ImpTrib>0.00</ImpTrib>
            <ImpIVA>0.00</ImpIVA>
            <MonId>PES</MonId>
            <MonCotiz>1</MonCotiz>
            <CondicionIVAReceptorId>${condicionIvaReceptor}</CondicionIVAReceptorId>
          </FECAEDetRequest>
        </FeDetReq>
      </FeCAEReq>
    </FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

    const resSolicitar = await fetch('https://servicios1.afip.gov.ar/wsfev1/service.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAESolicitar'
      },
      body: soapSolicitar
    });

    const xmlSolicitar = await resSolicitar.text();
    const resultadoMatch = xmlSolicitar.match(/<Resultado>([A-Z])<\/Resultado>/);
    const caeMatch = xmlSolicitar.match(/<CAE>(\d+)<\/CAE>/);
    const vtoMatch = xmlSolicitar.match(/<CAEFchVto>(\d+)<\/CAEFchVto>/);

    if (!caeMatch || (resultadoMatch && resultadoMatch[1] !== 'A')) {
      const msgError = xmlSolicitar.match(/<Msg>([\s\S]*?)<\/Msg>/);
      throw new Error(msgError ? msgError[1] : 'ARCA rechazó el comprobante.');
    }

    const nroFormateado = `${String(ptoVta).padStart(5, '0')}-${String(nuevoNumero).padStart(8, '0')}`;

    return {
      statusCode: 200,
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
    console.error('Error ARCA:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};