// Define el usuario y la contraseña del login y los guarda en .env.local.
// Uso: npm run set-login   (la contraseña se escribe oculta y nunca se imprime)
import fs from "node:fs";
import readline from "node:readline";
import bcrypt from "bcryptjs";

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? s : "*");
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const user = (await ask("Usuario: ")).trim();
const password = await ask("Contraseña (mínimo 12 caracteres): ", true);
const repeat = await ask("Repetí la contraseña: ", true);

if (user.length < 3) throw new Error("El usuario es muy corto.");
if (password.length < 12) throw new Error("La contraseña debe tener al menos 12 caracteres.");
if (password !== repeat) throw new Error("Las contraseñas no coinciden.");

// Se guarda en base64 porque Next expande los "$" de un hash bcrypt dentro de .env.
const hashB64 = Buffer.from(await bcrypt.hash(password, 12)).toString("base64");

const path = ".env.local";
let lines = fs.existsSync(path) ? fs.readFileSync(path, "utf8").split(/\r?\n/) : [];
function setVar(name, value) {
  const i = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (i === -1) lines.push(`${name}=${value}`);
  else lines[i] = `${name}=${value}`;
}
setVar("APP_USER", user);
setVar("APP_PASSWORD_HASH_B64", hashB64);
fs.writeFileSync(path, lines.filter((l, i, a) => l !== "" || i < a.length - 1).join("\n") + "\n");

console.log("Listo. Usuario y hash guardados en .env.local.");
