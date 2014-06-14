// Built upon https://github.com/firebase/emberFire/tree/master/examples/blog
        
function googleApiLoaded() {
	gapi.client.setApiKey('AIzaSyAauB9b2dKDr2D6nbvNaWcM00KjjLkNJuw');
};

(function (window) {

        var Promise = Ember.RSVP.Promise;

        ////////////////////////////////////////////////////////////
        // Utility
        ////////////////////////////////////////////////////////////

        var Utility = Ember.Object.extend({

                /**
                 * Return a user from the store. If the user doesn't exist, create a new user
                 *
                 * @param {String} username
                 * @return {Promise}
                 */

                getUserByUsername: function(username) {
                        var store = this.get('store');
                        username = username.replace(/[^a-zA-Z0-9 -]/g, '');
                        return this.get('store').find('user', username).then(function(user) {
                                return user;
                        }, function() {
                                // HACK: `find()` creates an entry in store.typeMapFor().idToRecord which prevents `createRecord()` from working
                                delete store.typeMapFor(store.modelFor('user')).idToRecord[username];
                                // A user couldn't be found, so create a new user
                                var user = store.createRecord('user', {
                                        id: username,
                                        created: new Date().getTime()
                                });
                                // Save the user
                                user.save();
                                return user;
                        });
                }

        });

        ////////////////////////////////////////////////////////////
        // App
        ////////////////////////////////////////////////////////////

        var App = Ember.Application.create({
                ready: function () {
                        // Util
                        this.register('utility:main', Utility, { singleton: true, instantiate: true });
                        ['controller', 'route', 'component', 'adapter', 'transform', 'model', 'serializer'].forEach(function(type) {
                                this.inject(type, 'util', 'utility:main');
                        }, this);
                        // Store
                        ['component', 'utility:main'].forEach(function(type) {
                                this.inject(type, 'store', 'store:main');
                        }, this);
                }
        });
	
		Ember.Application.initializer({
			name: 'authentication',
			initialize: function(container, application) {
				container.register('authenticator:googleplus', App.GooglePlusAuthenticator);
				Ember.SimpleAuth.setup(container, application);
			}
		});
		
			// the custom authenticator that initiates the authentication process with Google+
		App.GooglePlusAuthenticator = Ember.SimpleAuth.Authenticators.Base.extend({
			restore: function(properties) {
				return new Ember.RSVP.Promise(function(resolve, reject) {
					if (!Ember.isEmpty(properties.access_token)) {
						resolve(properties);
					} else {
						reject();
					}
				});
			},
			authenticate: function() {
				return new Ember.RSVP.Promise(function(resolve, reject) {
					gapi.auth.authorize({
						client_id:                '547861256142-5mrvr7htj1e0lgf4bj3g7r0o0jecoicu.apps.googleusercontent.com',
						scope:                        ['https://www.googleapis.com/auth/plus.me'],
						'approvalprompt': 'force',
						immediate:                false
					}, function(authResult) {
						if (authResult && !authResult.error) {
							resolve({ access_token: authResult.access_token });
						} else {
							reject((authResult || {}).error);
						}
					});
				});
			},
			invalidate: function() {
				return Ember.RSVP.resolve();
			}
		});
	
        ////////////////////////////////////////////////////////////
        // EmberData
        ////////////////////////////////////////////////////////////

        App.ApplicationAdapter = DS.FirebaseAdapter.extend({
                firebase: new Firebase('https://patfm.firebaseio.com')
        });

        App.Post = DS.Model.extend({
                title: DS.attr('string'),
                body: DS.attr('string'),
                published: DS.attr('number'),
                publishedDate: function() {
                        return moment(this.get('published')).format('MMMM Do, YYYY');
                }.property('published'),
                user: DS.belongsTo('user', { async: true }),
                comments: DS.hasMany('comment', { async: true })
        });

        App.Comment = DS.Model.extend({
                body: DS.attr('string'),
                published: DS.attr('number'),
                publishedDate: function() {
                        var m = moment(this.get('published'));
                        return '%@ at %@'.fmt(m.format('MMMM Do, YYYY'), m.format('h:mm:ss a'));
                }.property('published'),
                user: DS.belongsTo('user', { async: true })
        });

        App.User = DS.Model.extend({
                created: DS.attr('number'),
                username: function() {
                        return this.get('id');
                }.property(),
                avatar: function() {
                        return 'https://www.gravatar.com/avatar/' + md5(this.get('id')) + '.jpg?d=retro&size=80';
                }.property(),
                posts: DS.hasMany('post', { async: true })
        });

        App.RawTransform = DS.Transform.extend({
                deserialize: function(serialized) {
                        return serialized;
                },
                serialize: function(deserialized) {
                        return deserialized;
                }
        });

        ////////////////////////////////////////////////////////////
        // Routes
        ////////////////////////////////////////////////////////////

		App.ApplicationRoute = Ember.Route.extend(Ember.SimpleAuth.ApplicationRouteMixin);
	
        App.Router.map(function() {
                this.resource('posts', { path: '/posts' }, function() {
                        this.route('new');
                });
                this.resource('post', { path: '/post/:post_id' });
                this.route('login');
        });

                /////////////////////////////////////////////
                // Index
                /////////////////////////////////////////////

                App.IndexRoute = Ember.Route.extend({
                        redirect: function() {
                                this.transitionTo('posts');
                        }
                });
        
                /////////////////////////////////////////////
                // Posts
                /////////////////////////////////////////////

                App.PostsIndexRoute = Ember.Route.extend({
                        model: function() {
                                return this.store.findAll('post');
                        }
                });

                App.PostsIndexController = Ember.ArrayController.extend({
                        sortProperties: ['published'],
                        sortAscending: false
                });

                App.PostsNewController = Ember.ObjectController.extend({
                        init: function() {
                                this.set('post',        Ember.Object.create());
                        },
                        postIsValid: function() {
                                var isValid = true;
                                ['post.title', 'post.username', 'post.body'].forEach(function(field) {
                                        if (this.get(field) === '') {
                                                isValid = false;
                                        }
                                }, this);
                                return isValid;
                        },
                        actions: {
                                publishPost: function() {
                                        if (!this.postIsValid()) { return; }
                                        Ember.RSVP.hash({
                                                user: this.get('util').getUserByUsername(this.get('post.username'))
                                        })
                                        .then(function(promises) {
                                                var newPost = this.store.createRecord('post', {
                                                        title: this.get('post.title'),
                                                        body: this.get('post.body'),
                                                        published: new Date().getTime(),
                                                        user: promises.user
                                                });
                                                newPost.save();
                                                this.setProperties({
                                                        'post.title': '',
                                                        'post.username': '',
                                                        'post.body': ''
                                                });
                                                this.transitionToRoute('post', newPost);
                                        }.bind(this));
                                }
                        },
                        post: undefined
                });

                /////////////////////////////////////////////
                // Post
                /////////////////////////////////////////////

                App.PostRoute = Ember.Route.extend({
                        model: function(params) {
                                return this.store.find('post', params.post_id);
                        }
                });

                App.PostController = Ember.ObjectController.extend({
                        actions: {
                                publishComment: function(post, comment) {
                                        comment.save().then(function() {
                                                Promise.cast(post.get('comments')).then(function(comments) {
                                                        comments.addObject(comment);
                                                        post.save().then(function() {}, function() {});
                                                });
                                        });
                                }
                        }
                });
                
                /////////////////////////////////////////////
                // Login
                /////////////////////////////////////////////
		
		App.LoginRoute = Ember.Route.extend({
			actions: {
			    	// action to trigger authentication with Google+
			    	authenticateWithGooglePlus: function() {
						this.get('session').authenticate('authenticator:googleplus', {});
			    	}
			}
		});
							
		App.LoginController = Ember.Controller.extend(Ember.SimpleAuth.LoginControllerMixin, {
			authenticatorFactory: 'ember-simple-auth-authenticator:oauth2-password-grant'
		});


        ////////////////////////////////////////////////////////////
        // Components
        ////////////////////////////////////////////////////////////

                ///////////////////////////////////////////////
                // Post
                ///////////////////////////////////////////////

                App.FirePostComponent = Ember.Component.extend({
                        classNames: ['post'],
                        classNameBindings: ['isExpanded:post-expanded', 'isSingle:post-single'],
                        commentUsername: '',
                        commentBody: '',
                        commentIsValid: function() {
                                var isValid = true;
                                ['commentUsername', 'commentBody'].forEach(function(field) {
                                        if (this.get(field) === '') {
                                                isValid = false;
                                        }
                                }, this);
                                return isValid;
                        },
                        actions: {
                                publishComment: function() {
                                        if (!this.commentIsValid()) { return; }
                                        var store = this.get('store');
                                        Ember.RSVP.hash({
                                                user: this.get('util').getUserByUsername(this.get('commentUsername'))
                                        }).then(function(promises) {
                                                // Create a new comment
                                                var comment = store.createRecord('comment', {
                                                        body: this.get('commentBody'),
                                                        published: new Date().getTime(),
                                                        user: promises.user
                                                });
                                                // Tell the post about the comment
                                                this.sendAction('onPublishComment', this.get('post'), comment);
                                                // Reset the fields
                                                this.setProperties({
                                                        commentUsername: '',
                                                        commentBody: ''
                                                });
                                        }.bind(this));
                                },
                                removeComment: function(comment) {
                                        var post = this.get('post');
                                        Promise.cast(post.get('comments')).then(function(comments) {
                                                comments.removeObject(comment);
                                                comment.destroyRecord();
                                                post.save();
                                        });
                                }
                        },
                });

                App.FirePostSlugComponent = Ember.Component.extend({
                        classNames: ['post-slug'],
                        publishedMonth: function() {
                                return moment(this.get('post.published')).format('MMM');
                        }.property('post.published'),
                        publishedDay: function() {
                                return moment(this.get('post.published')).format('D');
                        }.property('post.published')
                });

        ////////////////////////////////////////////////////////////
        // Helpers
        ////////////////////////////////////////////////////////////

        Ember.Handlebars.helper('breaklines', function(value, options) {
                var escaped = Ember.Handlebars.Utils.escapeExpression(value);
                                escaped = escaped.replace(/(\r\n|\n|\r)/gm, '<br>');
                return new Ember.Handlebars.SafeString(escaped);
        });

        Ember.Handlebars.helper('markdown', function(value, options) {
                return new Ember.Handlebars.SafeString(window.markdown.toHTML(value));
        });

})(window);