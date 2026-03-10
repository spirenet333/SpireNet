if(sessionStorage.getItem("spirenet_usb_verified") !== "true"){
  window.location.href = "index.html";
}

const APP_NAME = "spirenet";

const terminal = document.getElementById("terminal");
const input = document.getElementById("hiddenInput");
const tap = document.getElementById("tapCatcher");
const hint = document.getElementById("hint");

let history = [];
let current = "";

function lc(value){
  return (value ?? "").toString().toLowerCase();
}

function push(line){
  history.push(lc(line));
}

function render(){
  terminal.textContent = history.join("\n") + "\n> " + current + "_";
  terminal.scrollTop = terminal.scrollHeight;
}

function focusInput(){
  input.focus();
  setTimeout(() => input.focus(), 30);
  setTimeout(() => input.focus(), 120);

  setTimeout(() => {
    if(document.activeElement === input){
      hint.style.display = "none";
    }
  }, 80);
}

tap.addEventListener("touchstart", focusInput, { passive: true });
tap.addEventListener("pointerdown", focusInput, { passive: true });
terminal.addEventListener("touchstart", focusInput, { passive: true });
terminal.addEventListener("pointerdown", focusInput, { passive: true });

input.addEventListener("input", () => {
  current = lc(input.value);
  if(input.value !== current){
    input.value = current;
  }
  render();
});

input.addEventListener("keydown", (event) => {
  if(event.key === "Enter"){
    event.preventDefault();

    const line = lc(current).trim();

    if(line){
      history.push("> " + line);
      run(line);
    }

    current = "";
    input.value = "";
    render();
  }
});

function run(commandLine){
  const parts = commandLine.split(" ").filter(Boolean);
  const command = parts[0];

  if(command === "commandls"){
    push("commands:");
    push("commandls");
    push("cmmdhelp");
    push("clear");
    push("whoami");
    push("pwd");
    push("printpg");
    return;
  }

  if(command === "cmmdhelp"){
    push("commandls : list commands");
    push("cmmdhelp : command descriptions");
    push("clear : clear terminal");
    push("whoami : show current user");
    push("pwd : show current directory");
    push("printpg : open print view");
    return;
  }

  if(command === "clear"){
    history = [];
    return;
  }

  if(command === "whoami"){
    push("operator");
    return;
  }

  if(command === "pwd"){
    push("/spirenet");
    return;
  }

  if(command === "printpg"){
    openPrintPage();
    push("print ready");
    return;
  }

  push("unknown command");
}

function openPrintPage(){
  const text = `print page

user: operator
cwd: /spirenet
`;

  const safe = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>print</title>
<style>
body{
  font-family:menlo,monospace;
  font-size:12px;
  margin:40px;
  color:#000;
  background:#fff;
}
pre{
  white-space:pre-wrap;
  word-wrap:break-word;
  font-family:menlo,monospace;
  font-size:12px;
}
</style>
</head>
<body>
<pre>${safe}</pre>
<script>
setTimeout(()=>{window.print()},400)
<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

push(APP_NAME + " ready");
push('type "commandls" to list commands');
push('type "cmmdhelp" for descriptions');

render();

setTimeout(() => {
  try{
    input.focus();
  }catch(error){}
}, 700);
