import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { getCustomer } from "./crm.js";
import { ID } from "./id.js";
import { TestStorage } from './storage.js';

/**
 * @typedef {Object} InvoicePosition
 * @property {string} description
 * @property {number} amount
 * @property {number} taxPercentage
 * @property {number | undefined} hours
 */

/**
 * @typedef {Object} Invoice
 * @property {string} $id
 * @property {number} dueInDays
 * @property {Date} $createdAt
 * @property {string} title
 * @property {number} number
 * @property {import("./crm").Customer} customer
 * @property {InvoicePosition[]} positions
 * @property {number?} discount
 * @property {Date?} paidAt
 * @property {boolean} finalized
 * @property {boolean} canceled
 */

/**
 * @type {Invoice[]}
 */
const invoices = [];
const saveInvoices = (storage = TestStorage) => {
    storage().save('invoices', invoices.map(c => {
        console.log(c);
        return {
        ...c,
        customer: {$id: c.customer.$id},
    }}));
}

export const loadInvoices = (storage = TestStorage) => {
    const loaded = storage().load('invoices');
    if (loaded == undefined) return;
    loaded.forEach((invoice) => {
        invoices.push({
            ...invoice,
            customer: getCustomer(invoice.customer.$id)
        });
    });
}

export const getInvoice = (id, graceful = false) => invoices.find(c => c.$id === id) ?? graceful ? invoices.find(c => c.$id.startsWith(id)) : undefined;

export const getInvoices = ({after}) => invoices.filter(c => !after || c.$createdAt > after);

/**
 * @param {string} title
 * @param {import("./crm").Customer} customer
 * @param {InvoicePosition[]} positions
 * @returns {Invoice}
 */
export function newInvoice(title, dueInDays, customer, positions = []) {
    return {
        title,
        dueInDays,
        $createdAt: new Date(),
        customer: customer,
        positions: positions,
        finalized: false,
        canceled: false,
    };
}

/**
 * @param {Invoice} invoice 
 */
export function cancelInvoice(invoice) {
    invoice.canceled = true;
    saveInvoices();
}

export function finalizeInvoice(invoice) {
    invoice.finalized = true;
    saveInvoices();
}

export function addPosition(invoice, position) {
    invoice.positions.push(position);
    saveInvoices();
}

export function calculateMetrics(invoice) {
    const sum = invoice.positions.reduce((prev, curr) => prev + +curr.amount, 0);
    const sumWithTax = invoice.positions.reduce((prev, curr) => prev + +curr.amount * (1 + (curr.taxPercentage / 100)),0);

    const hoursWorked = invoice.positions.reduce((prev, curr) => prev + curr?.hours, 0);
    return {
        sum,
        sumWithTax,
        hoursWorked,
    };
}

/**
 * @param {Invoice} invoice 
 * @param {*} positionIndex 
 */
export function removePosition(invoice, positionIndex) {
    invoice.positions = invoice.positions.filter((_, i) => i !== positionIndex);
    saveInvoices();
}

/**
 * @param {Invoice} invoice 
 */
export const storeInvoice = (invoice) => {
    invoice.number = invoices.length;
    console.log(invoice);
    invoices.push({...invoice, $id: ID()});
    saveInvoices();
}

export function generatePdf(invoice) {
    const content = `---
number: ${invoice.number}
dueIn: ${invoice.dueInDays}
customer:
    name: ${invoice.customer.name}
    email: ${invoice.customer.email}
    address: |
        ${invoice.customer.address}
position:
    ${invoice.positions.map((pos) => {
    return `
    - name: |
        ${pos.description}
      amount: ${pos.hours}
      unit: h
      price: ${pos.amount / pos.hours}
      vat: ${pos.taxPercentage}`
    }).join('\n\t')}
...`;

    writeFileSync('/tmp/' + invoice.$id + ".md", content, {flag: 'w+'})

    spawnSync(`pandoc /tmp/${invoice.$id}.md -o ${invoice.$id}.pdf --template=invoice`, {
        shell: true,
        cwd: process.cwd(),
    })
}

export function sendViaEmail(invoice) {
    spawn(`open 'mailto:${invoice.customer.email}?subject=Rechnung&body=HalloWelt'`, {shell: true});
}