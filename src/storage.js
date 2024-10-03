import * as fs from 'fs';

export function LocalStorage() {
    return {
        load: (key) => {
            const value = localStorage.getItem(key);
            if (value === undefined)
                return undefined;
            return JSON.parse(value);
        },
        save: (key, value) => {
            return localStorage.setItem(key, JSON.stringify(value));
        }
    };
}

export function TestStorage() {
    return {
        load: (key) => {
            const dataStr = fs.readFileSync('./data.json');
            const data = JSON.parse(dataStr ?? '{}');
            const value = data[key];
            if (value === undefined)
                return undefined;
            return value;
        },
        save: (key, value) => {
            const dataStr = fs.readFileSync('./data.json');
            const data = JSON.parse(dataStr ?? '{}');
            data[key] = value;
            return fs.writeFileSync('./data.json', JSON.stringify(data, undefined, 2));
        }
    };
}