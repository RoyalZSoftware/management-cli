import { stdin, stdout } from "node:process";
import readline from "node:readline";
import { getCustomers, loadCustomers, newCustomer, storeCustomer } from "./crm.js";
import { getInvoices, loadInvoices, newInvoice, storeInvoice, getInvoice, finalizeInvoice, cancelInvoice, addPosition, removePosition, calculateMetrics, generatePdf, sendViaEmail } from "./invoice.js";
import { getTimeTrackingEntries, loadTimeTrackingEntries, startTimeTracking, stopTimeTracking } from "./timetracking.js";

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
        console.log("This CLI aims to create simple invoices. Managing a business file based.")
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
        const title = await ask('Invoice title');
        const dueInDays = await ask('Enter days when due. (Leave empty for 14 days)') || 14;
        const customerQuery = await ask('Select a customer. Please enter a query: ');
        let selectedCustomer = undefined;

        while (customerQuery != 'q' || selectedCustomer != undefined) {
            const customers = getCustomers(customerQuery);
            if (customers.length === 0) {
                console.log("Nothing found. Please try a different query. Enter 'q' to exit")
                continue;
            }

            customers.forEach((customer, i) => {
                console.log(i + ") " + customer.name + ", " + customer.email)
            })

            const result = await ask("Enter the index. Enter 'q' to exit. Enter 'r' to search again");

            if (result == 'q') break;
            if (result == 'r') break;
            
            if (+result == NaN) {
                throw new Error("Invalid index.");
            }

            selectedCustomer = customers[+result];
            break;
        }
        if (selectedCustomer == undefined) throw new Error('No customer selected.');

        const invoice = newInvoice(title, +dueInDays, selectedCustomer, []);

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
        const {sum, sumWithTax, hoursWorked} = calculateMetrics(invoice);
        console.log(invoice);
        console.log("Sum", sum)
        console.log("Sum w/ tax", sumWithTax)
        console.log("Hours", hoursWorked)
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
    }, "Add position to invoice", ['--invoiceId']);

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

        generatePdf(invoice);
    }, 'Use the latex template to create a invoice.', ['--invoiceId'])

    cli.addCmd(['invoice', 'sharePdf'], (options) => {
        const invoice = ensureInvoice(options);

        sendViaEmail(invoice);
    }, 'Use the latex template to create a invoice.', ['--invoiceId'])

    cli.addCmd(['invoice', 'cancel'], (options) => {
        const invoice = ensureInvoice(options);
        cancelInvoice(invoice);
    }, 'Finalizes an invoice', ['--invoiceId']);
    cli.addCmd(['customer', 'create'], async (options) => {
        const name = await ask('Customer name');
        const email = await ask('Customer email');
        const address = await ask('Customer address');

        const customer = newCustomer(name, email, address);

        const verified = await verify(customer);

        if (!verified) return;

        storeCustomer(customer);

    }, 'Create a new customer');
    cli.addCmd(['customer', 'list'], async (options) => {
        const customers = getCustomers();

        customers.forEach((customer) => {
            console.log(customer.$id + ""+ customer.name);
        });
    }, 'List all customers');

    cli.addCmd(['time', 'start'], async (options) => {
        
        const description = options.description ?? (await ask("Please enter a description"));

        const entry = startTimeTracking(description);
        console.log("Started time tracking.", entry);
    }, "Start time tracking", ['--description']);
    cli.addCmd(['time', 'stop'], async (options) => {
        const entry = stopTimeTracking();
        console.log("Stopped time tracking.", entry);
    }, "Stop time tracking");
    cli.addCmd(['time', 'list'], async (options) => {

        const entries = getTimeTrackingEntries();

        entries.forEach((entry) => {
            console.log(entry.start + " - " + entry.end + " - " + entry.description);
        });
    }, "List time tracking entries");

    loadCustomers();
    loadTimeTrackingEntries();
    loadInvoices();

    try {

        await cli.run();
    } catch(e) {
        console.error(e.message);
    }
}

await main();
