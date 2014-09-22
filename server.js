var express = require('express');
var session = require('express-session');

/** 
* Used by passport.js serializing data 
*/
var cookieParser = require('cookie-parser');

/**
* bodyParser - For parsing payloaods from post requests. 
* Also used by passport.js
*/
var bodyParser = require('body-parser');

var app = express();

var logger = require('nlogger').logger(module);

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;
    mongoose.connect('mongodb://localhost/test');

var Schema = mongoose.Schema;

var userSchema = new Schema( {
    id: String,
    name: String,
    password: String,
    picture: String,
    followers: [ObjectId],
    following: [ObjectId]
});

var postSchema = new Schema( { 
    author: String,
    text: String,
    timestamp: Date
});

var User = mongoose.model('User', userSchema);
var Post = mongoose.model('Post', postSchema);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false })); // parse application/json // used for POST and parsed request.body
app.use(bodyParser.json()); // parse application/vnd.api+json as json
app.use(bodyParser.json({ type: 'application/vnd.api+json' }));
app.use(session({ secret: 'keyboard cat', resave: true, saveUninitialized: true, rolling: true }));
app.use(passport.initialize());
app.use(passport.session());


/**
* User LOGIN or get users. Used for following and follower stream
*/
app.get('/api/users', function(req, res) {
    logger.info('GET users');
    if (req.query.operation === 'login') {
        logger.info('user logging in: ', req.query.username);
        passport.authenticate('local', function(err, user, info) {
           
            if (err) { 
                logger.error('Passport authenticate error in authenticating');
                return res.status(500).end(); 
            }
            
            if (!user) { 
                return res.status(404).end(); 
            }
            
            logger.info("this is user: ", user);

            req.logIn(user, function(err) {
                if (err) { 
                    logger.error('Something wrong with res.login()');
                    return res.status(500).end(); 
                }
                return res.send({ users: [copyUser(user)] } );
            });
        })(req, res);

    } else if (req.query.operation === 'authenticating') {
        logger.info('isAuthenticated: ', req.isAuthenticated());
        
        if (req.isAuthenticated()) {
            return res.send({ users:[req.user] });
        } else {
            return res.send({ users: [] } );    
        }
    } else {
        logger.info('find all users');
        Users.find({}, function (err, users) {
            return res.send({ users: users } );    
        })
        
    }
});

/**
* This GET REQUEST is for specific users.
* Used for url username request. 
* Also for dashboard individual user-posts.
*/

app.get('/api/users/:user_id', function (req, res) {
logger.info('GET REQUEST for individual user: ', req.params.user_id);
    User.findOne({ 'id': req.params.user_id }, function (err, user) {
        if (err) { return res.status(404).end() };
        return res.send({ 'user': copyUser(user) });
    });
});


app.get('/api/users/:user_id/following', function (req, res) {
    logger.info('GET Users Following: ',req.query.following );
    User.find({}, function (err, users) {
        if (err) return res.status(404).end();
        return res.send({ users: users });
    })
});


/**
* This is the local stratgey used by Passport.
* Passport can use different types of strategies. 
*/

passport.use(new LocalStrategy(
    function (username, password, done) {
        logger.info('Using local strategy');
        findOne( username, function (err, user) {
            if (err) { 
                logger.info('findOne returned error in local passport');
                return done(err); 
            }
            if (!user) { 
                logger.warn('User is incorrect.');
                return done(null, false, { message: 'Incorrect username' } );
            }
            if (user.password !== password) {
                logger.warn('Password is incorrect.');
                return done(null, false, { message: 'Incorrect password.' } );
            }
            logger.info('local returning user: ', user);
            return done(null, user);
        });
    })
);

/**
* In a typical web application, 
* the credentials used to authenticate a user 
* will only be transmitted during the login request. req.login()
* If authentication succeeds, 
* a session will be established and maintained via a cookie set in the user's browser.
*/

/**
* Serialize is called by req.login. 
* It takes in user instances to be used for sessions. 
* The following uses user.id (this is used to keep data in the session small).
*/

passport.serializeUser(function(user, done) {
    logger.info('serialized!!');
    //passes in unique key
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  findOne(id, function(err, user) {
    done(err, user);
  });
});


/**
* Requesting posts from the Posts Stream
* dashboard GET()
*/

app.get('/api/posts', function (req, res) {
    logger.info('GET on /api/posts');


/** 
* query - If there's an author get the posts from that author.
* else get all the posts.
*/
    var query = req.query.author ? { 'author': req.query.author } : {} ;

    Post.find(query, function (err, posts) {
        if (err) return res.status(403).end();
        var emberPosts = [];
        posts.forEach(function(post) {
            var emberPost = {
                id: post._id,
                author: post.author, 
                text: post.text,
                timestamp: post.timestamp
            }
            emberPosts.push(emberPost);
        });
        return res.send({ posts: emberPosts } );
    });
});


/**
* Creating a post. Most Likely from the dashboard.
*/
app.post('/api/posts', ensureAuthenticated, function (req, res) {
    logger.info('posts request');

    var post = {
        author: req.body.post.author,
        text: req.body.post.text,
        timestamp: req.body.post.timestamp
    };

    if (req.user.id === post.author) {
        logger.info('id and author passed');

        Post.create(post, function (err, post) {
            if (err) return res.status(403).end();
            
            logger.info('Post Record Created: ', post.text);
            
            var emberPost = {
                id: post._id,
                author: req.user.id,
                text: post.text,
                timestamp: post.timestamp
            };
            
            return res.send({ post: emberPost });
        });
    } else {
        logger.warning('user tried unauthorized post');
        return res.status(403).end();
    }
});


/**
* CREATE USER - new user record.
* POST is always used for creating a new record.
*/
app.post('/api/users', function (req, res) {
    logger.info('CREATE USER - POST to api/users');

    if (req.body.user) {

        User.create(req.body.user, function (err, user) {
            if (err) return res.status(403).end();
            logger.info('User Created: ', user.id);
        });    

        req.login(req.body.user, function(err) {
            logger.info('req.login');

            if (err) { return res.status(500).end(); }
            return res.send({ user: copyUser(req.body.user) } );
        });

    } else {
        logger.debug('signUp error: ', req.body.user);
        res.status(403).end();
    }
});


/**
* Delete Post.
*/
app.delete('/api/posts/:post_id', ensureAuthenticated, function (req, res) {
    Post.remove({ author: req.params.post_id }, function (err) {
        if (err) return res.status(404).end();
        return res.send({});
    });
});


app.get('/api/logout', function (req, res) {
    req.logout();
    return res.status(200).end();
});


function findOne (username, fnc) {
    logger.info('findOne function. Looking for: ', username);

    User.findOne({ 'id': username }, function(err, user) {
        if (err) return console.error(err);
        if (!user) { 
            logger.warn('findOne() user not found'); 
            return fnc(null, null);
        }

        logger.info('user found: ', user);
        return fnc(null, user);
    });
}


/**
* Used to delete password and return user object.
*/

function copyUser (obj) {
    var copy = {
        id: obj.id,
        name: obj.name,
        picture: '/assets/images/cristian-strat.png'
    };
    return copy;
}


//is also a middleware
function ensureAuthenticated (req, res, next) {
    logger.debug('ensureAuthticated: ', req.isAuthenticated());
    if (req.isAuthenticated()) {
        logger.info('isAuthenticated');
        return next();
    } else {
        return res.status(403);
    }
}

var server = app.listen(3000, function() {
    console.log('Serving on: ', server.address().port, '**************************************');
});