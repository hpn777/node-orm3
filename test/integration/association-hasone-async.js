var ORM      = require('../../');
var helper   = require('../support/spec_helper');
var should   = require('should');
var async    = require('async');
var _        = require('lodash');
var common   = require('../common');
var protocol = common.protocol();

describe("hasOne", function() {
  var db    = null;
  var Tree  = null;
  var Stalk = null;
  var Leaf  = null;
  var leafId = null;
  var treeId = null;
  var stalkId = null;
  var holeId  = null;

  var setup = function (opts) {
    opts = opts || {};
    return async function () {
      db.settings.set('instance.identityCache', false);
      db.settings.set('instance.returnAllErrors', true);
      Tree  = db.define("tree",   { type:   { type: 'text'    } });
      Stalk = db.define("stalk",  { length: { type: 'integer' } });
      Hole  = db.define("hole",   { width:  { type: 'integer' } });
      Leaf  = db.define("leaf", {
        size:   { type: 'integer' },
        holeId: { type: 'integer', mapsTo: 'hole_id' }
      }, {
        validations: opts.validations
      });
      Leaf.hasOne('tree',  Tree,  { field: 'treeId', autoFetch: !!opts.autoFetch });
      Leaf.hasOne('stalk', Stalk, { field: 'stalkId', mapsTo: 'stalk_id' });
      Leaf.hasOne('hole',  Hole,  { field: 'holeId' });

      await helper.dropSyncAsync([Tree, Stalk, Hole, Leaf]);
      
      const tree = await Tree.create({ type: 'pine' });
      treeId = tree[Tree.id];
      
      const leaf = await Leaf.create({ size: 14 });
      leafId = leaf[Leaf.id];
      
      await leaf.setTree(tree);
      
      const stalk = await Stalk.create({ length: 20 });
      should.exist(stalk);
      stalkId = stalk[Stalk.id];
      
      const hole = await Hole.create({ width: 3 });
      holeId = hole.id;
    };
  };

  before(async function() {
    db = await helper.connectAsync();
  });

  after(async function() {
    await db.close();
  });

  describe("accessors Async", function () {
    before(setup());

    it("get should get the association", function () {
      return Leaf
        .one({ size: 14 })
        .then(function (leaf) {
          should.exist(leaf);
          return leaf.getTree();
        })
        .then(function (tree) {
          should.exist(tree);
        });
    });

    it("should return proper instance model", function () {
      return Leaf
        .one({ size: 14 })
        .then(function (leaf) {
          return leaf.getTree();
        })
        .then(function (tree) {
          tree.model().should.equal(Tree);
        });
    });

    it("get should get the association with a shell model", function () {
      return Leaf(leafId)
        .getTree()
        .then(function (tree) {
          should.exist(tree);
          should.equal(tree[Tree.id], treeId);
        });
    });

    it("has should indicate if there is an association present", function () {
      return Leaf.one({ size: 14 })
        .then(function (leaf) {
          should.exist(leaf);
          return Promise.all([leaf, leaf.hasTree()]);
        })
        .then(function ([leaf, has]) {
          should.equal(has, true);
          return leaf.hasStalk();
				})
        .then(function (has) {
          should.equal(has, false);
        });
    });

    it("set should associate another instance", function () {
      return Stalk
        .one({ length: 20 })
        .then(function (stalk) {
          should.exist(stalk);
          return Promise.all([stalk, Leaf.one({ size: 14 })]);
        })
        .then(function ([stalk, leaf]) {
          should.exist(leaf);
          should.not.exist(leaf.stalkId);
          return Promise.all([stalk, leaf.setStalk(stalk)]);
        })
        .then(function (stalk) {
          return Promise.all([stalk, Leaf.one({ size: 14 })]);
        })
        .then(function ([stalk, leafOne]) {
          should.equal(leafOne.stalkId, stalk[0][Stalk.id]);
        });
    });

    it("remove should unassociation another instance", function () {
      return Stalk
        .one({ length: 20 })
        .then(function (stalk) {
          should.exist(stalk);
          return Leaf.one({size: 14});
        })
        .then(function (leaf) {
          should.exist(leaf);
          should.exist(leaf.stalkId);
          return leaf.removeStalk();
				})
        .then(function () {
          return Leaf.one({ size: 14 });
        })
        .then(function (leaf) {
          should.equal(leaf.stalkId, null);
        });
    });
  });

  if (protocol != "mongodb") {
    describe("mapsTo Async", function () {
      describe("with `mapsTo` get via `getOneAsync`", function () {
        var leaf = null;

        before(setup());

        before(async function () {
          leaf = await Leaf.create({ size: 444, stalkId: stalkId, holeId: holeId });
        });

        it("should get parent", function () {
          return leaf
            .getStalk()
            .then(function (stalk) {
              should.exist(stalk);
              should.equal(stalk.id, stalkId);
              should.equal(stalk.length, 20);
            });
        });
      });

      describe("with `mapsTo` set via property definition", function () {
        var leaf = null;

        before(setup());

        before(async function () {
          leaf = await Leaf.create({ size: 444, stalkId: stalkId, holeId: holeId });
        });

        it("should get parent", function () {
          return leaf
            .getHole()
            .then(function (hole) {
              should.exist(hole);
              should.equal(hole.id, stalkId);
              should.equal(hole.width, 3);
            });
        });
      });
    });
  };
});
