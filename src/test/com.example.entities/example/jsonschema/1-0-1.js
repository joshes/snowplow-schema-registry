module.exports = {
  'This may do something I suspect': (t, sp, assert) => {
    t.track(sp.buildPageView({
      pageUrl: 'http://www.example.com',
      referrer: 'http://www.referer.com'
    }));
    assert.ok();
  }
}