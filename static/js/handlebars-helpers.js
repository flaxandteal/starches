// Register all custom Handlebars helpers needed by precompiled templates
(function() {
  if (typeof Handlebars === 'undefined') {
    console.error('Handlebars runtime not loaded');
    return;
  }

  // Check if already registered to avoid double registration
  if (Handlebars.helpers && Handlebars.helpers.equal) {
    console.log('Handlebars helpers already registered');
    return;
  }

  Handlebars.registerHelper("pointToCoords", (point) => point.features[0].geometry.coordinates.map((c) => (c.toFixed(8))).join(", "));
  Handlebars.registerHelper("replace", (base, fm, to) => base ? base.replaceAll(fm, to) : base);
  Handlebars.registerHelper("nl", (base, nl) => base ? base.replaceAll("\n", nl) : base);
  Handlebars.registerHelper("plus", (a, b) => a + b);
  Handlebars.registerHelper("any", (a, b, c) => {
    if (!Array.isArray(a)) return false;
    // Did we get one positional argument or two (the rightmost is a context object).
    if (c) {
      return a.some(x => x[b] && (!Array.isArray(x[b]) || x[b].length > 0));
    } else {
      return a.some(x => x && (!Array.isArray(x) || x.length > 0));
    }
  });
  Handlebars.registerHelper("default", (a, b) => a === undefined || a === null ? b : a);
  Handlebars.registerHelper("defaulty", (a, b) => a != undefined && a != null && a != false ? a : b);
  Handlebars.registerHelper("equal", (a, b) => a == b);
  Handlebars.registerHelper("or", (a, b) => a || b);
  Handlebars.registerHelper("join", (...args) => {
    if (args.length == 3 && Array.isArray(args[0])) {
      return args[0].join(args[1]);
    }
    return args.slice(0, args.length - 2).join(args[args.length - 2]);
  });
  Handlebars.registerHelper("and", (a, b) => a && b);
  Handlebars.registerHelper("not", (a, b) => a != b);
  Handlebars.registerHelper("in", (a, b) => Array.isArray(b) ? b.includes(a) : (a in b));
  Handlebars.registerHelper("nospace", (a) => a.replaceAll(" ", "%20"));
  Handlebars.registerHelper("escapeExpression", (a) => Handlebars.Utils.escapeExpression(a));
  Handlebars.registerHelper("clean", (a) => {
    if (a && typeof a === 'object' && '__clean' in a) {
      return a.__clean;
    }
    return a;
  });
  Handlebars.registerHelper("concat", (...args) => args.slice(0, args.length - 1).join(""));
  Handlebars.registerHelper("array", (...args) => args);
  Handlebars.registerHelper("dialogLink", (options) => {
    return new Handlebars.SafeString(
      `<button class="govuk-button dialog-link" data-dialog-id="${options.hash.id}">Show</button>`
    );
  });
  Handlebars.registerHelper("includes", (arr, prop, val) =>
    Array.isArray(arr) && arr.some(item => item[prop] === val)
  );
  Handlebars.registerHelper("json", (value) => {
    try {
      return new Handlebars.SafeString(JSON.stringify(value));
    } catch {
      return "";
    }
  });

  // ---- Geospatial helpers -------------------------------------------------
  // Pull the [lon, lat] out of a GeoJSON FeatureCollection's first feature.
  // In the current heritage template we only enter the geometry block for
  // Centroid / Feature (point) shapes, so the first vertex is the only vertex.
  function extractLonLat(fc) {
    if (!fc || !fc.features || !fc.features[0] || !fc.features[0].geometry) return null;
    const c = fc.features[0].geometry.coordinates;
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      return [c[0], c[1]];
    }
    return null;
  }

  // Queensland spans MGA zones 54 (138-144E), 55 (144-150E), 56 (150-156E).
  // Zone is chosen by longitude band; the caller uses this to build an
  // EPSG target code (MGA2020 = 7854/7855/7856) for the epsg.io transform link.
  function mgaZoneForLon(lon) {
    if (lon < 144) return 54;
    if (lon < 150) return 55;
    return 56;
  }

  Handlebars.registerHelper("lat", (fc) => {
    const ll = extractLonLat(fc);
    return ll ? ll[1].toFixed(6) : "";
  });
  Handlebars.registerHelper("lon", (fc) => {
    const ll = extractLonLat(fc);
    return ll ? ll[0].toFixed(6) : "";
  });
  Handlebars.registerHelper("mgaZone", (fc) => {
    const ll = extractLonLat(fc);
    return ll ? mgaZoneForLon(ll[0]) : "";
  });
  Handlebars.registerHelper("osmLink", (fc) => {
    const ll = extractLonLat(fc);
    if (!ll) return "";
    const lon = ll[0].toFixed(6);
    const lat = ll[1].toFixed(6);
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
  });
  // Link to epsg.io's interactive coordinate transform with the point
  // pre-populated, target set to the appropriate MGA2020 zone. epsg.io applies
  // the proper NTv2 datum grid shift between WGS84 and GDA2020, so the reader
  // gets an authoritative Northing/Easting rather than us baking in an
  // approximate projection client-side.
  Handlebars.registerHelper("epsgTransformLink", (fc) => {
    const ll = extractLonLat(fc);
    if (!ll) return "";
    const lon = ll[0].toFixed(6);
    const lat = ll[1].toFixed(6);
    const target = 7850 + mgaZoneForLon(ll[0]); // 7854 / 7855 / 7856
    return `https://epsg.io/transform#s_srs=4326&t_srs=${target}&x=${lon}&y=${lat}`;
  });

  Handlebars.registerHelper("clean", (a) => {
    // If the value has a __clean property, return it (for Cleanable objects)
    if (a && typeof a === 'object' && a.__clean !== undefined) {
      return a.__clean;
    }
    // Otherwise return the value as-is
    return a;
  });

  console.log('Handlebars helpers registered');
})();
