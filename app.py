# Get rid of system 'webob', we provide our own
import sys
import os.path

for path in list(sys.path):
    if 'webob' in path:
        sys.path.remove(path)

for key in list(sys.modules):
    if key == 'webob' or key.startswith('webob'):
        del sys.modules[key]

sys.path.insert(0, os.path.dirname(__file__))


import webob.exc
import webob.dec
import routes
from google.appengine.ext.webapp import template
from google.appengine.api import users
from google.appengine.ext import db

from django.utils import simplejson


class Luuv(db.Model):
    who = db.UserProperty()
    what = db.StringProperty()
    type = db.IntegerProperty() # 0 = LUUV
    when = db.DateTimeProperty(auto_now_add=True)

class Application(object):

    # Using Routes here is probably a bit of an overkill
    map = routes.Mapper()
    map.connect('index', '/', method='index')
    map.connect('view', '/get_my_luuvs', method='get_my_luuvs')
    map.connect('view', '/get_latest_luuvs', method='get_latest_luuvs')
    map.connect('view', '/get_user_luuvs', method='get_user_luuvs')
    map.connect('view', '/do_luuv', method='do_luuv')
    map.connect('view', '/do_unluuv', method='do_unluuv')

    @webob.dec.wsgify
    def __call__(self, request):
        results = self.map.routematch(environ=request.environ)
        if not results:
            return webob.exc.HTTPNotFound()

        match, route = results
        kwargs = match.copy()
        method = kwargs.pop('method')
        return getattr(self, method)(request, **kwargs)

    # Helpers

    def templatePath(self, filename):
        return os.path.join(os.path.dirname(__file__), filename)

    def renderTemplate(self, filename, **options):
        body = template.render(self.templatePath(filename), options)
        return webob.Response(body)

    def redirect(self, url):
        return webob.Response(status=302, location=url)

    def json(self, data):
        return webob.Response(simplejson.dumps(data),
                              content_type="application/json")

    # Pages

    def index(self, request):
        options = {}
        user = users.get_current_user()
        if not user:
            options['login_url'] = users.create_login_url(request.url)
        else:
            options['logout_url'] = users.create_logout_url(request.url)
            options['user_email'] = user.email()

        return self.renderTemplate('index.html',
                                   app_url=request.application_url,
                                   **options)

    # JSON calls

    def get_my_luuvs(self, request):
        user = users.get_current_user()
        if not user:
            return self.json({})

        # TODO this doesn't scale at all... should implement batching here
        entries = Luuv.gql("WHERE who = :1 AND type = 0 "
                           "ORDER BY when DESC", user)
        return self.json({'luuvs': [{'who': user.email(),
                                     'what': item.what,
                                     'when': item.when.ctime()}
                                    for item in entries]})

    def get_latest_luuvs(self, request):
        entries = Luuv.gql("WHERE type = 0 ORDER BY when DESC LIMIT 10")
        return self.json({'luuvs': [{'who': item.who.email(),
                                     'what': item.what,
                                     'when': item.when.ctime()}
                                    for item in entries]})
        # It would probably make a lot of sense to use isotime()
        # instead of ctime(), but only Firefox seems to be happy to
        # eat that for the Date constructor.

    def get_user_luuvs(self, request):
        who = request.GET.get('who')
        if not who:
            return self.json({})

        user = users.User(who)
        # TODO this doesn't scale at all... should implement batching here
        entries = Luuv.gql("WHERE who = :1 AND type = 0 "
                           "ORDER BY when DESC", user)
        return self.json({'luuvs': [{'who': who,
                                     'what': item.what,
                                     'when': item.when.ctime()}
                                    for item in entries]})

    def do_luuv(self, request):
        user = users.get_current_user()
        if not user:
            return self.json({})

        what = request.POST.get('what')
        if not what:
            return self.json({})

        # We don't allow duplicates
        if Luuv.gql("WHERE who = :1 AND what = :2 AND type = 0",
                    user, what).count():
            return self.json({})
        
        item = Luuv(who=user, what=what, type=0)
        item.put()
        return self.json({'new_luuv': {'what': item.what,
                                       'when': item.when.ctime()}})

    def do_unluuv(self, request):
        user = users.get_current_user()
        if not user:
            return self.json({})

        what = request.POST.get('what')
        if not what:
            return self.json({})

        # This will be an iteration over one item
        entries = Luuv.gql("WHERE who = :1 AND what = :2 AND type = 0 ",
                           user, what)
        for item in entries:
            item.delete()

        return self.json({'del_luuv': {'what': what}})


def main():
    from google.appengine.ext.webapp.util import run_wsgi_app
    run_wsgi_app(Application())

if __name__ == "__main__":
    main()
