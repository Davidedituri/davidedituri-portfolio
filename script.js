(function(){
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('year').textContent = new Date().getFullYear();

  /* header scroll state */
  var header = document.getElementById('siteHeader');
  window.addEventListener('scroll', function(){
    header.classList.toggle('scrolled', window.scrollY > 8);
  }, { passive:true });

  /* mobile menu */
  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('mobileMenu');
  function closeMenu(){
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded','false');
  }
  toggle.addEventListener('click', function(){
    var open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true':'false');
  });
  menu.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', closeMenu); });

  /* letterbox opening */
  var hero = document.querySelector('.hero');
  requestAnimationFrame(function(){
    setTimeout(function(){ hero.classList.add('opened'); }, reduced ? 0 : 260);
  });

  /* timecode ticker -- updates a few times a second, not every frame, to keep the main thread idle */
  var tc = document.getElementById('timecode');
  var frame = 0, fps = 24, step = reduced ? fps : 6;
  function fmt(n){ return String(n).padStart(2,'0'); }
  setInterval(function(){
    frame += step;
    var totalSec = Math.floor(frame / fps);
    var f = frame % fps;
    var h = Math.floor(totalSec/3600), m = Math.floor((totalSec%3600)/60), s = totalSec%60;
    tc.textContent = fmt(h)+':'+fmt(m)+':'+fmt(s)+':'+fmt(f);
  }, reduced ? 1000 : 250);

  /* scroll reveal */
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e, i){
      if(e.isIntersecting){
        e.target.style.transitionDelay = (i * 60) + 'ms';
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold:.2 });
  document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });

  /* film grain canvas in hero -- tiny internal resolution, upscaled via CSS for cheap redraws */
  var grain = document.getElementById('grain');
  if(grain){
    var GW = 120, GH = 68;
    grain.width = GW; grain.height = GH;
    var ctx = grain.getContext('2d');
    var imgData = ctx.createImageData(GW, GH);
    function draw(){
      var d = imgData.data;
      for(var i=0;i<d.length;i+=4){
        var v = (Math.random()*255)|0;
        d[i]=v; d[i+1]=v; d[i+2]=v; d[i+3]=255;
      }
      ctx.putImageData(imgData,0,0);
    }
    draw();
    if(!reduced){
      setInterval(draw, 200);
    }
  }

  /* project frame thumbnails: generative gradient + grain, seeded per card -- always
     drawn first as a backdrop, so it still looks intentional while a real YouTube
     thumbnail loads on top of it (or if no real video ID has been set yet) */
  document.querySelectorAll('.work-card .frame canvas').forEach(function(cv){
    var card = cv.closest('.work-card');
    var hue = parseInt(card.getAttribute('data-hue'),10) || 27;
    function render(){
      var w = cv.offsetWidth, h = cv.offsetHeight;
      var dpr = Math.min(window.devicePixelRatio||1, 2);
      cv.width = w*dpr; cv.height = h*dpr;
      var ctx = cv.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
      var g = ctx.createLinearGradient(0,0,w,h);
      g.addColorStop(0, 'hsl('+hue+',38%,14%)');
      g.addColorStop(1, 'hsl('+(hue+40)+',30%,8%)');
      ctx.fillStyle = g;
      ctx.fillRect(0,0,w,h);
      ctx.globalAlpha = .06;
      for(var i=0;i<1200;i++){
        var v = Math.random()*255;
        ctx.fillStyle = 'rgb('+v+','+v+','+v+')';
        ctx.fillRect(Math.random()*w, Math.random()*h, 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    render();
    window.addEventListener('resize', render);
  });

  /* ---------------------------------------------------------
     Video frames: real thumbnail + click-to-play inline, for
     either YouTube or Vimeo. Loads the thumbnail for any frame
     whose data-video has been filled in, and swaps in a real
     embed on click/Enter -- never navigates away from the page.

     data-video accepts ANY of these -- paste whatever the platform gives you:
       Z30029qzMrI                                  (bare YouTube ID)
       https://www.youtube.com/watch?v=Z30029qzMrI
       https://youtu.be/Z30029qzMrI
       https://www.youtube.com/shorts/Z30029qzMrI
       927579917                                    (bare Vimeo ID)
       https://vimeo.com/927579917
     --------------------------------------------------------- */
  function extractYouTubeId(raw){
    if(/^[\w-]{11}$/.test(raw)) return raw; // already a bare ID
    var patterns = [/[?&]v=([\w-]{11})/, /youtu\.be\/([\w-]{11})/, /embed\/([\w-]{11})/, /shorts\/([\w-]{11})/];
    for(var i=0;i<patterns.length;i++){
      var m = raw.match(patterns[i]);
      if(m) return m[1];
    }
    return '';
  }
  function extractVimeoId(raw){
    var m = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/i) || raw.match(/^(\d{5,12})$/);
    return m ? m[1] : '';
  }
  function parseVideoRef(raw){
    if(!raw) return null;
    raw = raw.trim();
    if(/vimeo/i.test(raw)){
      var vId = extractVimeoId(raw);
      if(vId) return { platform:'vimeo', id:vId };
    }
    if(/youtu/i.test(raw)){
      var yId = extractYouTubeId(raw);
      if(yId) return { platform:'youtube', id:yId };
    }
    // no domain in the string -- guess from shape
    if(/^[\w-]{11}$/.test(raw)) return { platform:'youtube', id:raw };
    if(/^\d{5,12}$/.test(raw)) return { platform:'vimeo', id:raw };
    return null;
  }

  document.querySelectorAll('.frame[data-video]').forEach(function(frame){
    var raw = frame.getAttribute('data-video') || '';
    var isPlaceholder = !raw || raw.indexOf('YOUR_VIDEO') !== -1 || raw.indexOf('YOUR_SHORT') !== -1;
    var ref = isPlaceholder ? null : parseVideoRef(raw);
    var thumb = frame.querySelector('.video-thumb');

    if(ref && thumb){
      if(ref.platform === 'youtube'){
        var triedFallback = false;
        function fallbackToHq(){
          if(triedFallback) return;
          triedFallback = true;
          thumb.src = 'https://img.youtube.com/vi/' + ref.id + '/hqdefault.jpg';
        }
        thumb.addEventListener('load', function(){
          /* YouTube serves a small grey placeholder (120x90) for videos without a
             maxres thumbnail -- fall back to hqdefault, which always exists */
          if(thumb.naturalWidth === 120 && thumb.naturalHeight === 90){ fallbackToHq(); return; }
          thumb.classList.add('is-loaded');
        });
        /* some videos 404 on maxresdefault entirely instead of serving the small
           placeholder -- hqdefault.jpg always exists for any public video */
        thumb.addEventListener('error', fallbackToHq);
        thumb.src = 'https://img.youtube.com/vi/' + ref.id + '/maxresdefault.jpg';
      } else if(ref.platform === 'vimeo'){
        /* Vimeo has no guessable thumbnail URL pattern -- its public oEmbed
           endpoint returns one and supports CORS, no API key needed */
        fetch('https://vimeo.com/api/oembed.json?url=' + encodeURIComponent('https://vimeo.com/' + ref.id))
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(data){
            if(data && data.thumbnail_url){
              thumb.src = data.thumbnail_url;
              thumb.addEventListener('load', function(){ thumb.classList.add('is-loaded'); });
            }
          })
          .catch(function(){ /* keep the generative canvas backdrop if this fails */ });
      }
    }

    function activate(){
      if(!ref){
        var msg = isPlaceholder
          ? 'Add your YouTube or Vimeo link (<code style="color:var(--accent)">data-video</code>) to enable playback.'
          : 'Couldn&#39;t read a video from that link -- double-check it and try again.';
        frame.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:var(--font-mono);font-size:.78rem;letter-spacing:.03em;color:var(--fg-muted);background:var(--bar)">' + msg + '</div>';
        return;
      }
      var iframe = document.createElement('iframe');
      var watchUrl;
      if(ref.platform === 'youtube'){
        iframe.src = 'https://www.youtube.com/embed/' + ref.id + '?autoplay=1&rel=0';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        watchUrl = 'https://www.youtube.com/watch?v=' + ref.id;
      } else {
        iframe.src = 'https://player.vimeo.com/video/' + ref.id + '?autoplay=1';
        iframe.allow = 'autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media';
        watchUrl = 'https://vimeo.com/' + ref.id;
      }
      iframe.title = frame.getAttribute('aria-label') || 'Video';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.innerHTML = '';
      frame.appendChild(iframe);

      /* Escape hatch: if this specific video has embedding disabled by its
         owner, the platform shows its own error *inside* the iframe -- our
         script can't detect that (cross-origin), so always offer a link out. */
      var fallback = document.createElement('a');
      fallback.className = 'frame-fallback-link';
      fallback.href = watchUrl;
      fallback.target = '_blank';
      fallback.rel = 'noopener';
      fallback.textContent = ref.platform === 'youtube' ? 'Watch on YouTube \u2197' : 'Watch on Vimeo \u2197';
      frame.appendChild(fallback);
    }

    frame.addEventListener('click', function(e){
      if(e.target.closest('a')) return; // let the fallback link behave like a normal link
      activate();
    });
    frame.addEventListener('keydown', function(e){
      if(e.target !== frame) return; // don't hijack Enter/Space inside the embedded player or fallback link
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); activate(); }
    });
  });
})();
