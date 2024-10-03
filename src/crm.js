/**
 * @typedef {Object} Customer
 * @property {string} $id
 * @property {string} $createdAt
 * @property {string} name
 * @property {string} email
 */

import { ID } from "./id.js";

/**
 * @type {Customer[]}
 */
let customers = [];

export const getCustomers = () => customers;

/**
 * @param {string} id 
 */
export const getCustomer = (id) => {
    return customers.find(c => c.$id === id);
}

/**
 * @param {Customer} customer 
 */
export const saveCustomer = (customer) => {
    customers.push({...customer, $id: ID()});
}