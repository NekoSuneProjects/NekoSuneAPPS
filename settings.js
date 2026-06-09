// settings.js
const Store = require('electron-store');
const store = new Store();

module.exports = {
    get(key, defaultValue) {
        return store.get(key, defaultValue);
    },
    set(key, value) {
        store.set(key, value);
    }
};
