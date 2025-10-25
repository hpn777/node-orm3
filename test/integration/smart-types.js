var should   = require('should');
var helper   = require('../support/spec_helper');
var ORM      = require('../../');

describe("Smart types", function () {
  var db = null;
  var User = null;
  var Profile = null;
  var Post = null;
  var Group = null;

  var setup = function () {
    return async function () {
      User = db.define("user", {
        username: { type: 'text', size: 64 },
        password: { type: 'text', size: 128 }
      }, {
        id: 'username'
      });

      Profile = User.extendsTo("profile", {
        firstname: String,
        lastname: String
      }, {
        reverse: 'user',
        required: true
      });

      Group = db.define("group", {
        name: { type: 'text', size: 64 }
      }, {
        id: 'name'
      });
      Group.hasMany('users', User, {}, {
        reverse: 'groups'
      });

      Post = db.define("post", {
        content: String
      }, {
      });
      Post.hasOne('user', User, {
        reverse: 'posts'
      });

      ORM.singleton.clear();
      await helper.dropSync([User, Profile, Group, Post]);

      const billy = await User.create({
        username: 'billy',
        password: 'hashed password'
      });

      const profile = new Profile({ firstname: 'William', lastname: 'Franklin' });
      await billy.setProfile(profile);

      const groups = [new Group({ name: 'admins' }), new Group({ name: 'developers' })];
      await billy.addGroups(groups);

      const posts = new Post({ content: 'Hello world!' });
      await billy.setPosts(posts);
    };
  };

  before(async function () {
    db = await helper.connect();
  });

  after(async function () {
    await db.close();
  });

  describe("extends", function () {
    before(setup());

    it("should be able to get extendsTo with custom id", async function () {
      var billy = await User.get('billy');
      should.exist(billy);

      var profile = await billy.getProfile();
      should.exist(profile);
      should.equal(profile.firstname, 'William');
      should.equal(profile.lastname, 'Franklin');
    });

    it("should be able to get hasOne with custom id", async function () {
      var billy = await User.get('billy');
      should.exist(billy);

      var posts = await billy.getPosts();
      should.exist(posts);
      should.equal(posts.length, 1);
      should.equal(posts[0].content, 'Hello world!');
    });

    it("should be able to get hasMany with custom id", async function () {
      var billy = await User.get('billy');
      should.exist(billy);

      var groups = await billy.getGroups();
      should.exist(groups);
      should.equal(groups.length, 2);
    });

  });
});
