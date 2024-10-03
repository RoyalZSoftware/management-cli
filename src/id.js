/**
 * @returns {string}
 */
export function ID() {
    return Math.random().toString(16).slice(2).substring(0, 8);
}
