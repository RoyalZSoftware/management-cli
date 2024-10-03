import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import readline from "node:readline";
import { getInvoices, loadInvoices, newInvoice, storeInvoice, getInvoice, finalizeInvoice, cancelInvoice, addPosition, removePosition } from "./invoice.js";

const ask = async (question) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: stdin,
      output: stdout,
    });

    rl.question(question + "\n", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

function Cli() {
    
    let commands = {};
    const showHelp = () => {
        console.log("CLI Help!")
        console.log("")
        Object.entries(commands).forEach(([path, command]) => {
            console.log(" . ", path.replace(".", " "), (command.options ? command.options.map(c => c + ' <VAL>').join(' ') : "") +  " - " + command.description);
        });
    };

    return {
        addCmd: (path, fn, description, options) => {
            commands[path.join('.')] = {cb: fn, description, options};
        },
        run: async () => {
            const args = process.argv.slice(2);
            const until = args.findIndex(c => c.startsWith('--'));
            const cmdPath = args.slice(0, until === -1 ? undefined : until);

            const cmd = commands[cmdPath.join('.')];
            const options = args.slice(cmdPath.length).reduce((prev, curr, i) => {
                if (i % 2 == 0) {
                    // expect that this is the optionName: --exampleCount
                    if (!curr.startsWith('--')) throw new Error('Malformed options string.');
                    
                    prev[curr.replace("--", "")] = args.slice(cmdPath.length)[i +1];
                    if (prev[curr.replace("--", "")] == undefined) {
                        throw new Error('Malformed options string.');
                    }
                    return prev;
                }
                return prev;
            }, {});

            if (cmd == undefined)
            {
                showHelp();
                return;
            }
            
            await cmd.cb(options);
        }
    };
}

async function verify(object) {
    console.log("");
    console.log(object);
    console.log("");
    console.log("type 'yes' or 'no'");
    return await ask('Looks good?').then((response) => {
        const verified = response === 'yes';

        if (!verified) {
            console.log("Aborting.")
        } else {
            console.log("Verified.")
        }

        return verified;
    });
}

async function main() {
    const cli = Cli();
    cli.addCmd(['invoice', 'create'], async () => {
        console.log("Creating a new invoice")
        const title = await ask('Invoice title');
        const customer = await ask('Customer name');

        const invoice = newInvoice(title, {email: 'panov', name: customer}, []);

        const verified = await verify(invoice);

        if (!verified) return;

        storeInvoice(invoice);

    }, 'Create a new invoice.');
    
    const ensureInvoice = (options) => {
        const invoiceId = options.invoiceId;
        if (invoiceId == undefined) throw new Error('You did not provide a invoiceId. Do this by appending --invoiceId <VALUE>');
        let invoice = getInvoice(invoiceId, true);
        
        if (invoice === undefined) throw new Error('Invoice with id ' + invoiceId + ' not found.');

        return invoice;
    }

    cli.addCmd(['invoice', 'list'], (options) => {
        getInvoices(options).forEach(c => console.log(c.$id + " " + c.$createdAt +  " " + c.title))
    }, 'Show all invoices', ['--after']);

    cli.addCmd(['invoice', 'details'], (options) => {
        const invoice = ensureInvoice(options);
        console.log(invoice);
        

        const sum = invoice.positions.reduce((prev, curr) => prev + +curr.amount, 0);
        console.log("Sum:", sum, "€ with tax:", invoice.positions.reduce((prev, curr) => prev + +curr.amount * (1 + (curr.taxPercentage / 100)),0) + " €");
    }, "Display full invoice", ['--invoiceId']);

    cli.addCmd(['invoice', 'addPosition'], async (options) => {
        const invoice = ensureInvoice(options);
        const description = await ask('Position description');
        const hours = await ask('Hours. (Leave empty to specify efforts directly)');
        let efforts = 0;
        if (!hours) {
            efforts = +(await ask('Money to charge'));
        } else {
            const hourlyRate = +(await ask('Hourly rate. (Leave empty for 90€)') || 90);

            efforts = +(hours) * hourlyRate;
        }
        if (efforts == NaN)
            throw new Error("Efforts is invalid.");
        const taxPercentage = await ask('Tax. Leave empty for default 19%.') || 19;

        const position = {
            hourlyRate: (hours ? efforts / hours : undefined),
            description,
            amount: efforts,
            taxPercentage,
            hours: +hours || undefined,
        };

        const verified = await verify(position);

        if (!verified) return;

        addPosition(invoice, position);
    }, "Add position to invoice", ['--invoiceId', '--type']);

    cli.addCmd(['invoice', 'delPosition'], async (options) => {
        const invoice = ensureInvoice(options);
        if (invoice.positions.length === 0) {
            console.log("nothing to do.")
            return;
        }
        invoice.positions.forEach((position, i) => {
            console.log(i + ") " + position.description + " - " + position.amount);
        })
        const index = await ask('Which position should be deleted? (Press any letter to abort.)');

        if (+index == NaN) return;
        if (invoice.positions[index] == undefined) throw new Error('Invalid index selected.');

        console.log("[*] I will delete following...");
        const verified = await verify(invoice.positions[index]);

        if (!verified) return;
        removePosition(invoice, +index);

    }, "Display full invoice", ['--invoiceId']);

    cli.addCmd(['invoice', 'finalize'], (options) => {
        const invoice = ensureInvoice(options);
        finalizeInvoice(invoice);
    }, 'Finalizes an invoice', ['--invoiceId']);
    
    cli.addCmd(['invoice', 'generatePdf'], (options) => {
        const invoice = ensureInvoice(options);

        const content = `---
number: DRAFT-${invoice.number}
dueIn: 14
customer:
    name: ${invoice.customer.name}
    email: info@isar-heiztechnik.de
    address: |
        Industriestraße 48 \\\\
        82194 Gröbenzell
position:
    ${invoice.positions.map((pos) => {
    return `
    - name: |
        ${pos.description}
      amount: ${pos.hours}
      unit: h
      price: ${pos.amount}
      vat: ${pos.taxPercentage}`
    }).join('\n\t')}
...
        `;

        console.log(content);

        writeFileSync('/tmp/' + invoice.$id + ".md", content, {flag: 'w+'})

        const x = spawn(`pandoc /tmp/${invoice.$id}.md -o ${invoice.$id}.pdf --template=invoice`, {
            shell: true,
            cwd: process.cwd(),
        })

        x.stdout.on('data', (dt) => {
            console.log(dt.toString())
        })
        x.stderr.on('data', (dt) => {
            console.log(dt.toString())
        })
    })

    cli.addCmd(['invoice', 'cancel'], (options) => {
        const invoice = ensureInvoice(options);
        cancelInvoice(invoice);
    }, 'Finalizes an invoice', ['--invoiceId']);
    loadInvoices();

    try {

        await cli.run();
    } catch(e) {
        console.error(e.message);
    }
}

await main();
