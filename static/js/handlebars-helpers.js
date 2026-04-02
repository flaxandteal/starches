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
