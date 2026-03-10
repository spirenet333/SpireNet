/* =======================================
   SPIRENET USB ACCESS GATE
======================================= */

if (localStorage.getItem("spirenet_usb_verified") !== "true") {
    window.location.href = "index.html";
}

/* =======================================
   SPIRENET INTERFACE CORE
======================================= */

document.addEventListener("DOMContentLoaded", () => {

    const terminal = document.getElementById("terminal");
    const input = document.getElementById("commandInput");

    function printLine(text){
        const line = document.createElement("div");
        line.textContent = text;
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
    }

    function printPrompt(){
        const prompt = document.createElement("div");
        prompt.textContent = "> ";
        terminal.appendChild(prompt);
    }

    function handleCommand(cmd){

        cmd = cmd.trim().toLowerCase();

        if(cmd === "help"){
            printLine("available commands:");
            printLine("help");
            printLine("status");
            printLine("clear");
            printLine("logout");
        }

        else if(cmd === "status"){
            printLine("node status: connected");
        }

        else if(cmd === "clear"){
            terminal.innerHTML = "";
        }

        else if(cmd === "logout"){
            localStorage.removeItem("spirenet_usb_verified");
            window.location.href = "index.html";
        }

        else{
            printLine("unknown command");
        }

        printPrompt();
    }

    if(input){
        input.addEventListener("keydown", function(e){

            if(e.key === "Enter"){

                const value = input.value;

                const line = document.createElement("div");
                line.textContent = "> " + value;
                terminal.appendChild(line);

                handleCommand(value);

                input.value = "";
            }

        });
    }

    printLine("spireNet interface initialized");
    printLine("type 'help' for commands");
    printPrompt();

});
