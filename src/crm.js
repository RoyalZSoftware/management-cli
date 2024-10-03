/**
 * @typedef {Object} Customer
 * @property {string} $id
 * @property {string} $createdAt
 * @property {string} name
 * @property {string} address
 * @property {string} email
 */

import { ID } from "./id.js";
import { TestStorage } from "./storage.js";

/**
 * @type {Customer[]}
 */
let customers = [];

const saveCustomers = (storage = TestStorage) => {
    storage().save('customers', customers);
}

export const loadCustomers = (storage = TestStorage) => {
    const loaded = storage().load('customers');
    if (loaded == undefined) return;
    loaded.forEach((customer) => {
        customers.push(customer);
    });
}

const buildSearchIndex = (customer) => {
    return (customer.name + " " + customer.email + " " + customer.address).toLowerCase();
}

/**
 * @param {string} query 
 * @returns 
 */
export const getCustomers = (query) => query ? customers.filter(c => buildSearchIndex(c).includes(query.toLowerCase())): customers;

/**
 * @param {string} id 
 */
export const getCustomer = (id) => {
    return customers.find(c => c.$id === id);
}

/**
 * @param {Customer} customer 
 */
export const storeCustomer = (customer) => {
    customers.push({...customer, $id: ID()});
    saveCustomers();
}

export const newCustomer = (name, email, address) => {
    return {
        name,
        email,
        address
    };
}