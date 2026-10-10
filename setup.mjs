import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const template=await readFile(new URL('.env.example',import.meta.url),'utf8');
try{
 await writeFile(new URL('.env',import.meta.url),template
 .replace('replace-with-a-random-database-password',randomBytes(24).toString('hex'))
 .replace('replace-with-at-least-32-random-characters',randomBytes(48).toString('hex')),
 {flag:'wx',mode:0o600});
 console.log('.env created with random secrets. Next: docker compose up --build -d');
}catch(e){if(e.code==='EEXIST')console.log('.env already exists; it was not overwritten.');else throw e}
