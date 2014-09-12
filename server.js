var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/test');
//Library for mongoDB.
var bodyParser = require('body-parser');

var app = express();

var logger = require('nlogger').logger(module);

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

logger.info('info message');
logger.debug('debug message');

app.use(cookieParser());

app.use(bodyParser.urlencoded({ extended: false })); // parse application/json // used for POST and parsed request.body
app.use(bodyParser.json()); // parse application/vnd.api+json as json
app.use(bodyParser.json({ type: 'application/vnd.api+json' }));

//Encryption here with secret key 
app.use(session({ secret: 'keyboard cat', resave: true, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());


app.get('/api/users', function(req, res) {
    if (req.query.operation === 'login') {
        logger.info('user logging in: ', req.query.username);
        passport.authenticate('local', function(err, user, info) {
            //Called by done(x,y,z);
            //Middleware functions that take CookieParser -> NEXT -> BodyParser ->Session etc.. 
            //end()  - send response
            if (err) { return res.status(500).end(); }
            //send 404 should only provide data. agnostic to the client
            // if (!user) { return res.redirect('/login'); }
            if (!user) { return res.status(404).end(); }
            //logIn sets the cookie. 
            logger.info("this is user: ", user);
            req.logIn(user, function(err) {
                if (err) { return res.status(500).end(); }
                return res.send( { users: [copyUser(req.user)] } );
            });
        })(req, res);    
    } else {
        var usersCopy = users;
        for (var i = 0, j = users.length; i < j; i++) {
            delete users[i].password;
        }
        return res.send( { users: usersCopy } );
    }
    
});

passport.use(new LocalStrategy(
    function (username, password, done) {
        findOne( username, function (err, user) {
            if (err) { 
                return done(err); 
            }
            if (!user) { 
                return done(null, false, { message: 'Incorrect username' } );
            }
            if (user.password !== password) {
                return done(null, false, { message: 'Incorrect password.' } );
            }
            return done(null, user);
        });
    })
);

passport.serializeUser(function(user, done) {
    //passes in unique key
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  findOne(id, function(err, user) {
    done(err, user);
  });
});

app.get('/api/posts', function (req, res) {
    res.send( { posts: posts } );
});

app.post('/api/posts', function (req, res) {
    logger.info('posts function');
    console.log(req.body.post.author, " sent post.");
    console.log("user is authenticated: ", req.isAuthenticated());
    var id = posts.length + 1;
    var post = {
        id: id,
        author: req.body.post.author,//THIS IS FROM BODY PARSER
        text: req.body.post.text,
        timestamp: req.body.post.timestamp
    };

    posts.push(post);
    res.send( { post: post } );
       
});

app.post('/api/users', function (req, res) {
    
    users.push(req.body.user);
    //logIn(user) set the coookie.
    logger.info('Create User: ', req.body.user);
    req.login(req.body.user, function(err) {
        if (err) { return res.status(500).end(); }
        logger.info('user authenticated: ', req.isAuthenticated());
        return res.send( { user: copyUser(req.body.user) } );
    });
    // res.send( { user: req.body.user } );

});

app.delete('/api/posts/:post_id', function(req, res) {

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

    for (var i = 0, j = users.length; i < j; i++) {
        if (req.params.user_id === users[i].id) {
            res.send( { 'user': copyUser(users[i]) } );
            break;
        }
    }
});

var findOne = function(username, fnc) {
    for (var i = 0, j = users.length; i < j; i++) {
        if (users[i].id === username) {
            return fnc(null, users[i]);
        } else {
            return null;
        }
    }
}

var copyUser = function(obj) {
    var copy = {
        id: obj.id,
        name: obj.name,
        picture: '/assets/images/cristian-strat.png'
    };
    return copy;
    // var extend = require('util')._extend; //private should be somewhere inside. Better way is to just create an object. instead of using copy fuction. 
    
}

var server = app.listen(3000, function() {
    console.log('Serving on: ', server.address().port);
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

