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
    picture: String
    
});

var postSchema = new Schema( { 
    id: Number,
    author: { type: String, ref: 'User.id' },
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

//Encryption here with secret key 
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
            //Called by done(x,y,z);
            //Middleware functions that take CookieParser -> NEXT -> BodyParser ->Session etc.. 
            //end()  - send response
            if (err) { 
                logger.error('Passport authenticate error in authenticating');
                return res.status(500).end(); 
            }
            //send 404 should only provide data. agnostic to the client
            // if (!user) { return res.redirect('/login'); }
            if (!user) { 
                return res.status(404).end(); 
            }
            //logIn sets the cookie. 
            logger.info("this is user: ", user);
            //server side
            req.logIn(user, function(err) {
                if (err) { 
                    logger.error('Something wrong with res.login()');
                    return res.status(500).end(); 
                }
                return res.send( { users: [copyUser(user)] } );
            });
        })(req, res);    
    } else if (req.query.operation === 'authenticating') {
        logger.info('isAuthenticated: ', req.isAuthenticated());
        if (req.isAuthenticated()) {
            return res.send( { users:[req.user] });
        } else {
            return res.send( { users: [] } );    
        }
        
    } else {
        return res.send( { users: [] } );
    }
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
    Post.find({}, function (err, posts) {
        if (err) return res.status(403).end();
        return res.send( { posts: posts } );
    });
});


/**
* Creating a post. Most Likely from the dashboard.
*/

app.post('/api/posts', ensureAuthenticated, function (req, res) {
    logger.info('posts request');
    var id = posts.length + 1;
    var post = {
        id: id,
        author: req.body.post.author,//THIS IS FROM BODY PARSER
        text: req.body.post.text,
        timestamp: req.body.post.timestamp
    };
    if (req.user.id === post.author) {
        logger.info('id and author passed');
        Post.create(post, function (err, post) {
            if (err) return res.status(403).end();
            logger.info('Post Record Created: ', post.text);
        });
        posts.push(post);
        res.send( { post: post } );    
    } else {
        logger.warning('user tried unauthorized post');
        return res.status(403).end();
    }
});


/**
* CREATE USER - new user record.
* POST is always used for creating a new record.
*/

// app.post('/api/users', function (req, res) {
//     logger.info('CREATE USER POST to api/users');
//     if (req.body.user) {
//         users.push(req.body.user);
//         logger.info('Create User: ', copyUser(req.body.user));
        
//         req.login(req.body.user, function(err) {
//             logger.info('req.login');
//             if (err) { return res.status(500).end(); }
//             return res.send( { user: copyUser(req.body.user) } );
//         });    
//     } else {
//         logger.debug('signUp error: ', req.body.user);
//         res.status(403).end();
//     }
// });


app.post('/api/users', function (req, res) {
    logger.info('CREATE USER - POST to api/users');

    if (req.body.user) {
        //create a new user document
        var user = new User(req.body.user);
        user.save(function (err) {
            if (err) {
                logger.error('document not created');
                return res.status(403).end();
            }
            logger.info('document saved!');
        });

        User.create(req.body.user, function (err, user) {
            if (err) return res.status(403).end();
            logger.info('User Created: ', user.id);
        });    

        req.login(req.body.user, function(err) {
            logger.info('req.login');

            if (err) { return res.status(500).end(); }
            return res.send( { user: copyUser(req.body.user) } );
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

    var index = parseInt(req.params.post_id);

    for (var i = 0; i < posts.length; i++) {
        
        if (posts[i].id === index) {
            posts.splice(i, 1);
            break;
        }
    }
    res.send({});
});



app.get('/api/users/:user_id', function (req, res) {

    User.findOne({ user: req.params_user_id }, function (err, user) {
        if (err) { return res.status(404).end() };
        return res.send( { 'user': user });
    });
    // for (var i = 0, j = users.length; i < j; i++) {
    //     if (req.params.user_id === users[i].id) {
    //         return res.send( { 'user': copyUser(users[i]) } );
    //     }
    // }

    // return res.status(404).end();

    //no matter what happens must responde to client. 

    //if nothing found res with 404
});

app.get('/api/logout', function (req, res) {
    req.logout();
    return res.status(200).end();
});

// function findOne (username, fnc) {
//     logger.info('findOne function');
//     for (var i = 0; i < users.length; i++) {
//         if (users[i].id === username) {
//             logger.info('user found: ', username);
//             return fnc(null, users[i]);
//         }
//     }

//     //if empty dictionary should return null
//     logger.warn('findOne() user not found');
// }

function findOne (username, fnc) {
    logger.info('findOne function');
    logger.info('looking for user: ', username);

    User.findOne({ 'id': username }, function(err, user) {
        if (err) return console.error(err);
        if (!user) { 
            logger.warn('findOne() user not found'); 
            return fnc(null, null);
        }

        logger.info('user found: ', user);
        return fnc(null, user);
    });

    //if empty dictionary should return null
    
}

function copyUser (obj) {
    var copy = {
        id: obj.id,
        name: obj.name,
        picture: '/assets/images/cristian-strat.png'
    };
    return copy;
    // var extend = require('util')._extend; //private should be somewhere inside. Better way is to just create an object. instead of using copy fuction. 
    
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

var users = [
    { 
        id: 'cristianstrat', 
        name: 'Christian Strat',
        password: 'hello',
        picture: '/assets/images/cristian-strat.png'
    },
    { 
        id: 'johnmaeda', 
        name: 'John Maeda',
        password: 'hello',
        picture: '/assets/images/cristian-strat.png'
    },
    { 
        id: 'clarkewolfe', 
        name: 'Clarke Wolfe',
        password: 'hello',
        picture: '/assets/images/cristian-strat.png'
    },
    { 
        id: 'fastcompany', 
        name: 'Fast Company',
        password: 'hello',
        picture: '/assets/images/cristian-strat.png'
    }
];

var posts = [
    { 
        id: 1,
        author: 'cristianstrat', 
        text: 'Great team constantly learn and re-learn how to move from the ego of *I* to the ego of *WE*.',
        timestamp: '2013-08-22T14:06:00+08:00'
    },
    {
        id: 2,
        author: 'clarkewolfe', 
        text: 'Listen, I don\'t want to brag about my awesome #gaming skills but someone made it into an @IGN article today...',
        timestamp: '2014-01-22T14:06:00+08:00'
    },
    { 
        id: 3,
        author: 'fastcompany', 
        text: 'THIS APP IS LIKE A REMOTE CONTROL FOR YOUR CREDIT CARDS',
        timestamp: '2014-08-22T14:17:37+08:00'
    },
    { 
        id: 4,
        author: 'fastcompany', 
        text: 'Leica is celebrating its 100th birthday by launching an entirely new camera system. Born out of a design partnership with Audi, the unibody Leica T is an APS-C-sensored minimalistic masterpiece.',
        timestamp: '2014-08-22T14:06:00+08:00'
    }
];

