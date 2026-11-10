import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAuthPopupUrl,
  isPopupWindowRequest,
  popupWindowSize,
} from '../src/main/tabs/window-open-policy.ts';

const link = (url) => ({ url, disposition: 'foreground-tab', features: '' });

test('Google OAuth popups need a real window', () => {
  assert.equal(
    isPopupWindowRequest({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&response_type=code&scope=openid',
      disposition: 'new-window',
      features: 'width=500,height=600',
    }),
    true,
  );
});

test('an auth URL opened with target="_blank" is promoted too', () => {
  assert.equal(
    isPopupWindowRequest(link('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=abc')),
    true,
  );
  assert.equal(isPopupWindowRequest(link('https://example.test/oauth2/authorize?state=xyz')), true);
  assert.equal(isPopupWindowRequest(link('https://accounts.google.com/signin/v2/identifier')), true);
});

test('plain links and normal navigations keep the tab treatment', () => {
  assert.equal(isPopupWindowRequest(link('https://example.test/articles/1')), false);
  assert.equal(isPopupWindowRequest(link('https://docs.example.test/oauth2')), false);
  assert.equal(
    isPopupWindowRequest({ url: 'https://example.test/search?q=oauth', disposition: 'foreground-tab', features: '' }),
    false,
  );
});

test('POST target=_blank must become a window so the body is not lost', () => {
  assert.equal(
    isPopupWindowRequest({
      url: 'https://idp.example.test/saml/SSO',
      disposition: 'foreground-tab',
      features: '',
      postBody: { data: [] },
    }),
    true,
  );
});

test('only http(s) URLs can be auth popups', () => {
  assert.equal(isAuthPopupUrl('file:///tmp/oauth2/authorize'), false);
  assert.equal(isAuthPopupUrl('not a url'), false);
});

test('popup size follows window features and is clamped', () => {
  assert.deepEqual(popupWindowSize('width=500,height=600'), { width: 500, height: 600 });
  assert.deepEqual(popupWindowSize('WIDTH=100,HEIGHT=100'), { width: 320, height: 320 });
  assert.deepEqual(popupWindowSize(''), { width: 520, height: 720 });
  assert.deepEqual(popupWindowSize('width=99999,height=abc'), { width: 1600, height: 720 });
});
