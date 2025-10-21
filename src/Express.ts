import * as orm from "./ORM";

var _models: any  = {};
var _db: any      = null;
var _pending: number = 0;
var _queue: any[]   = [];

export = function (uri: string, opts?: any) {
  opts = opts || {};

  _pending += 1;

  // Use async connect wrapped to work with middleware style
  (async () => {
    try {
      const db = await orm.connect(uri);

      if (Array.isArray(_db)) {
        _db.push(db);
      } else if (_db !== null) {
        _db = [ _db, db ];
      } else {
        _db = db;
      }

      if (typeof opts.define === "function") {
        if (opts.define.length > 2) {
          return opts.define(db, _models, function () {
            return checkRequestQueue();
          });
        }

        opts.define(db, _models);
      }

      return checkRequestQueue();
    } catch (err: any) {
      if (typeof opts.error === "function") {
        opts.error(err);
      } else {
        throw err;
      }

      return checkRequestQueue();
    }
  })();

  return function ORM_ExpressMiddleware(req: any, res: any, next?: any) {
    if (!Object.prototype.hasOwnProperty.call(req, "models")) {
      req.models = _models;
      req.db     = _db;
    }

    if (next === undefined && typeof res === 'function')
    {
      next = res;
    }

    if (_pending > 0) {
      _queue.push(next);
      return;
    }

    return next();
  };
};

function checkRequestQueue() {
  _pending -= 1;

  if (_pending > 0) return;
  if (_queue.length === 0) return;

  for (var i = 0; i < _queue.length; i++) {
    _queue[i]();
  }

  _queue.length = 0;
}
