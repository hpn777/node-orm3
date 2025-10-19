const aliases = require('./Drivers/aliases');

export function add(name: string, constructor: any): void {
  adapters[name] = constructor;
}

export function get(name: string): any {
  if (name in aliases) {
    return get(aliases[name]);
  } else if (!(name in adapters)) {
    adapters[name] = require("./Drivers/DML/" + name).Driver;
  }

  return adapters[name];
}

var adapters: any = {};
