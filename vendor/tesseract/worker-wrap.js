// Belegwerk: Sprachdaten liegen als .gz.wasm (überall auslieferbarer Dateityp). Pfad im Worker umbiegen.
(function () {
  var f = self.fetch.bind(self);
  self.fetch = function (u, o) {
    return f(String(u && u.url ? u.url : u).replace(/\.traineddata\.gz$/, '.traineddata.gz.wasm'), o);
  };
})();
importScripts('worker.min.js');
