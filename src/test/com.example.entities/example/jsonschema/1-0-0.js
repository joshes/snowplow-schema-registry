module.exports = {
  'It should send a page view on happy path': (t, sp, assert) => {
    t.track(sp.buildPageView({
      pageUrl: 'http://www.example.com',
      referrer: 'http://www.referer.com'
    }));
    assert.ok();
  }
}