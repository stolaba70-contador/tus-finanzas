const fs = require('fs');
const forge = require('node-forge');

const CUIT = '20399887209';
const RAZON_SOCIAL = 'TusFinanzas';
const CN = 'SistemaFacturacion';

console.log('Generando clave privada RSA de 2048 bits...');
const keys = forge.pki.rsa.generateKeyPair(2048);

const csr = forge.pki.createCertificationRequest();
csr.publicKey = keys.publicKey;
csr.setSubject([
  { name: 'countryName', value: 'AR' },
  { name: 'organizationName', value: RAZON_SOCIAL },
  { name: 'commonName', value: CN },
  { name: 'serialNumber', value: `CUIT ${CUIT}` }
]);

csr.sign(keys.privateKey, forge.md.sha256.create());

const pemKey = forge.pki.privateKeyToPem(keys.privateKey);
const pemCsr = forge.pki.certificationRequestToPem(csr);

fs.writeFileSync('privada.key', pemKey, 'utf8');
fs.writeFileSync('pedido.csr', pemCsr, 'utf8');

console.log('Listo: se crearon privada.key y pedido.csr');