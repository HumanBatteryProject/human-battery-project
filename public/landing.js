/* The landing's video slot.
 *
 * ONE ATTRIBUTE. Put a normal YouTube or Vimeo URL in data-video on
 * .video and this works out the provider and builds the player. The URL
 * forms people actually paste are all accepted:
 *
 *   data-video="https://www.youtube.com/watch?v=ID"
 *   data-video="https://youtu.be/ID"
 *   data-video="https://vimeo.com/123456789"
 *
 * No URL, or one this does not recognise, means the poster stays exactly as
 * the HTML shipped it: a plain div, not a button, so clicking does nothing
 * and nothing here has to run for that to be true.
 *
 * NOTHING AUTOPLAYS. The poster is a facade, so the player is not fetched
 * until someone clicks, and the embed carries no autoplay parameter, so the
 * film still waits for the play control inside the player. That is two
 * clicks by design rather than by accident.
 */
(function () {
  'use strict';

  function parse(raw) {
    var url;
    try { url = new URL(raw, window.location.origin); } catch (e) { return null; }
    var host = url.hostname.replace(/^www\./, '');
    var id;

    if (host === 'youtu.be') {
      id = url.pathname.slice(1);
    } else if (host === 'youtube.com' || host === 'm.youtube.com' ||
               host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = (url.pathname.match(/^\/(?:embed|v|shorts)\/([^/?#]+)/) || [])[1];
    } else if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      id = (url.pathname.match(/(?:^|\/)(\d+)(?:$|[/?#])/) || [])[1];
      // youtube-nocookie has no Vimeo equivalent; dnt=1 is the closest thing.
      return id ? { src: 'https://player.vimeo.com/video/' + id + '?dnt=1',
                    title: 'Vimeo player' } : null;
    } else {
      return null;
    }

    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    // -nocookie: this is a health site, and the poster does not phone home
    // before a click either.
    return { src: 'https://www.youtube-nocookie.com/embed/' + id, title: 'YouTube player' };
  }

  document.querySelectorAll('.video[data-video]').forEach(function (slot) {
    var raw = (slot.getAttribute('data-video') || '').trim();
    if (!raw) return;

    var video = parse(raw);
    if (!video) {
      // Leave the inert poster up rather than showing a broken frame.
      if (window.console) console.warn('[landing] unrecognised data-video URL:', raw);
      return;
    }

    var poster = slot.querySelector('.video-poster');
    if (!poster) return;

    // Upgrade the poster to a real control only now that there is something
    // to play. Keeps the no-URL case a plain, unfocusable div.
    var button = document.createElement('button');
    button.type = 'button';
    button.className = poster.className;
    button.setAttribute('aria-label', 'Play the film');
    button.innerHTML = poster.innerHTML;
    poster.replaceWith(button);

    button.addEventListener('click', function () {
      var frame = document.createElement('iframe');
      frame.src = video.src;
      frame.title = video.title;
      frame.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      frame.setAttribute('allowfullscreen', '');
      button.replaceWith(frame);
    }, { once: true });
  });
})();
