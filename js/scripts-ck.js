/*!
 * mustache.js - Logic-less {{mustache}} templates with JavaScript
 * http://github.com/janl/mustache.js
 */

/*global define: false*/

(function (root, factory) {
  // Modified to use window global
  window.Mustache = factory;
}(this, (function () {

  var exports = {};

  exports.name = "mustache.js";
  exports.version = "0.7.2";
  exports.tags = ["{{", "}}"];

  exports.Scanner = Scanner;
  exports.Context = Context;
  exports.Writer = Writer;

  var whiteRe = /\s*/;
  var spaceRe = /\s+/;
  var nonSpaceRe = /\S/;
  var eqRe = /\s*=/;
  var curlyRe = /\s*\}/;
  var tagRe = /#|\^|\/|>|\{|&|=|!/;

  var _test = RegExp.prototype.test;
  var _toString = Object.prototype.toString;

  // Workaround for https://issues.apache.org/jira/browse/COUCHDB-577
  // See https://github.com/janl/mustache.js/issues/189
  function testRe(re, string) {
    return _test.call(re, string);
  }

  function isWhitespace(string) {
    return !testRe(nonSpaceRe, string);
  }

  var isArray = Array.isArray || function (obj) {
    return _toString.call(obj) === '[object Array]';
  };

  function escapeRe(string) {
    return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
  }

  var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
  };

  function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
      return entityMap[s];
    });
  }

  // Export the escaping function so that the user may override it.
  // See https://github.com/janl/mustache.js/issues/244
  exports.escape = escapeHtml;

  function Scanner(string) {
    this.string = string;
    this.tail = string;
    this.pos = 0;
  }

  /**
   * Returns `true` if the tail is empty (end of string).
   */
  Scanner.prototype.eos = function () {
    return this.tail === "";
  };

  /**
   * Tries to match the given regular expression at the current position.
   * Returns the matched text if it can match, the empty string otherwise.
   */
  Scanner.prototype.scan = function (re) {
    var match = this.tail.match(re);

    if (match && match.index === 0) {
      this.tail = this.tail.substring(match[0].length);
      this.pos += match[0].length;
      return match[0];
    }

    return "";
  };

  /**
   * Skips all text until the given regular expression can be matched. Returns
   * the skipped string, which is the entire tail if no match can be made.
   */
  Scanner.prototype.scanUntil = function (re) {
    var match, pos = this.tail.search(re);

    switch (pos) {
    case -1:
      match = this.tail;
      this.pos += this.tail.length;
      this.tail = "";
      break;
    case 0:
      match = "";
      break;
    default:
      match = this.tail.substring(0, pos);
      this.tail = this.tail.substring(pos);
      this.pos += pos;
    }

    return match;
  };

  function Context(view, parent) {
    this.view = view;
    this.parent = parent;
    this._cache = {};
  }

  Context.make = function (view) {
    return (view instanceof Context) ? view : new Context(view);
  };

  Context.prototype.push = function (view) {
    return new Context(view, this);
  };

  Context.prototype.lookup = function (name) {
    var value = this._cache[name];

    if (!value) {
      if (name == '.') {
        value = this.view;
      } else {
        var context = this;

        while (context) {
          if (name.indexOf('.') > 0) {
            value = context.view;
            var names = name.split('.'), i = 0;
            while (value && i < names.length) {
              value = value[names[i++]];
            }
          } else {
            value = context.view[name];
          }

          if (value != null) break;

          context = context.parent;
        }
      }

      this._cache[name] = value;
    }

    if (typeof value === 'function') value = value.call(this.view);

    return value;
  };

  function Writer() {
    this.clearCache();
  }

  Writer.prototype.clearCache = function () {
    this._cache = {};
    this._partialCache = {};
  };

  Writer.prototype.compile = function (template, tags) {
    var fn = this._cache[template];

    if (!fn) {
      var tokens = exports.parse(template, tags);
      fn = this._cache[template] = this.compileTokens(tokens, template);
    }

    return fn;
  };

  Writer.prototype.compilePartial = function (name, template, tags) {
    var fn = this.compile(template, tags);
    this._partialCache[name] = fn;
    return fn;
  };

  Writer.prototype.getPartial = function (name) {
    if (!(name in this._partialCache) && this._loadPartial) {
      this.compilePartial(name, this._loadPartial(name));
    }

    return this._partialCache[name];
  };

  Writer.prototype.compileTokens = function (tokens, template) {
    var self = this;
    return function (view, partials) {
      if (partials) {
        if (typeof partials === 'function') {
          self._loadPartial = partials;
        } else {
          for (var name in partials) {
            self.compilePartial(name, partials[name]);
          }
        }
      }

      return renderTokens(tokens, self, Context.make(view), template);
    };
  };

  Writer.prototype.render = function (template, view, partials) {
    return this.compile(template)(view, partials);
  };

  /**
   * Low-level function that renders the given `tokens` using the given `writer`
   * and `context`. The `template` string is only needed for templates that use
   * higher-order sections to extract the portion of the original template that
   * was contained in that section.
   */
  function renderTokens(tokens, writer, context, template) {
    var buffer = '';

    var token, tokenValue, value;
    for (var i = 0, len = tokens.length; i < len; ++i) {
      token = tokens[i];
      tokenValue = token[1];

      switch (token[0]) {
      case '#':
        value = context.lookup(tokenValue);

        if (typeof value === 'object') {
          if (isArray(value)) {
            for (var j = 0, jlen = value.length; j < jlen; ++j) {
              buffer += renderTokens(token[4], writer, context.push(value[j]), template);
            }
          } else if (value) {
            buffer += renderTokens(token[4], writer, context.push(value), template);
          }
        } else if (typeof value === 'function') {
          var text = template == null ? null : template.slice(token[3], token[5]);
          value = value.call(context.view, text, function (template) {
            return writer.render(template, context);
          });
          if (value != null) buffer += value;
        } else if (value) {
          buffer += renderTokens(token[4], writer, context, template);
        }

        break;
      case '^':
        value = context.lookup(tokenValue);

        // Use JavaScript's definition of falsy. Include empty arrays.
        // See https://github.com/janl/mustache.js/issues/186
        if (!value || (isArray(value) && value.length === 0)) {
          buffer += renderTokens(token[4], writer, context, template);
        }

        break;
      case '>':
        value = writer.getPartial(tokenValue);
        if (typeof value === 'function') buffer += value(context);
        break;
      case '&':
        value = context.lookup(tokenValue);
        if (value != null) buffer += value;
        break;
      case 'name':
        value = context.lookup(tokenValue);
        if (value != null) buffer += exports.escape(value);
        break;
      case 'text':
        buffer += tokenValue;
        break;
      }
    }

    return buffer;
  }

  /**
   * Forms the given array of `tokens` into a nested tree structure where
   * tokens that represent a section have two additional items: 1) an array of
   * all tokens that appear in that section and 2) the index in the original
   * template that represents the end of that section.
   */
  function nestTokens(tokens) {
    var tree = [];
    var collector = tree;
    var sections = [];

    var token;
    for (var i = 0, len = tokens.length; i < len; ++i) {
      token = tokens[i];
      switch (token[0]) {
      case '#':
      case '^':
        sections.push(token);
        collector.push(token);
        collector = token[4] = [];
        break;
      case '/':
        var section = sections.pop();
        section[5] = token[2];
        collector = sections.length > 0 ? sections[sections.length - 1][4] : tree;
        break;
      default:
        collector.push(token);
      }
    }

    return tree;
  }

  /**
   * Combines the values of consecutive text tokens in the given `tokens` array
   * to a single token.
   */
  function squashTokens(tokens) {
    var squashedTokens = [];

    var token, lastToken;
    for (var i = 0, len = tokens.length; i < len; ++i) {
      token = tokens[i];
      if (token) {
        if (token[0] === 'text' && lastToken && lastToken[0] === 'text') {
          lastToken[1] += token[1];
          lastToken[3] = token[3];
        } else {
          lastToken = token;
          squashedTokens.push(token);
        }
      }
    }

    return squashedTokens;
  }

  function escapeTags(tags) {
    return [
      new RegExp(escapeRe(tags[0]) + "\\s*"),
      new RegExp("\\s*" + escapeRe(tags[1]))
    ];
  }

  /**
   * Breaks up the given `template` string into a tree of token objects. If
   * `tags` is given here it must be an array with two string values: the
   * opening and closing tags used in the template (e.g. ["<%", "%>"]). Of
   * course, the default is to use mustaches (i.e. Mustache.tags).
   */
  exports.parse = function (template, tags) {
    template = template || '';
    tags = tags || exports.tags;

    if (typeof tags === 'string') tags = tags.split(spaceRe);
    if (tags.length !== 2) throw new Error('Invalid tags: ' + tags.join(', '));

    var tagRes = escapeTags(tags);
    var scanner = new Scanner(template);

    var sections = [];     // Stack to hold section tokens
    var tokens = [];       // Buffer to hold the tokens
    var spaces = [];       // Indices of whitespace tokens on the current line
    var hasTag = false;    // Is there a {{tag}} on the current line?
    var nonSpace = false;  // Is there a non-space char on the current line?

    // Strips all whitespace tokens array for the current line
    // if there was a {{#tag}} on it and otherwise only space.
    function stripSpace() {
      if (hasTag && !nonSpace) {
        while (spaces.length) {
          delete tokens[spaces.pop()];
        }
      } else {
        spaces = [];
      }

      hasTag = false;
      nonSpace = false;
    }

    var start, type, value, chr, token;
    while (!scanner.eos()) {
      start = scanner.pos;

      // Match any text between tags.
      value = scanner.scanUntil(tagRes[0]);
      if (value) {
        for (var i = 0, len = value.length; i < len; ++i) {
          chr = value.charAt(i);

          if (isWhitespace(chr)) {
            spaces.push(tokens.length);
          } else {
            nonSpace = true;
          }

          tokens.push(['text', chr, start, start + 1]);
          start += 1;

          // Check for whitespace on the current line.
          if (chr == '\n') stripSpace();
        }
      }

      // Match the opening tag.
      if (!scanner.scan(tagRes[0])) break;
      hasTag = true;

      // Get the tag type.
      type = scanner.scan(tagRe) || 'name';
      scanner.scan(whiteRe);

      // Get the tag value.
      if (type === '=') {
        value = scanner.scanUntil(eqRe);
        scanner.scan(eqRe);
        scanner.scanUntil(tagRes[1]);
      } else if (type === '{') {
        value = scanner.scanUntil(new RegExp('\\s*' + escapeRe('}' + tags[1])));
        scanner.scan(curlyRe);
        scanner.scanUntil(tagRes[1]);
        type = '&';
      } else {
        value = scanner.scanUntil(tagRes[1]);
      }

      // Match the closing tag.
      if (!scanner.scan(tagRes[1])) throw new Error('Unclosed tag at ' + scanner.pos);

      token = [type, value, start, scanner.pos];
      tokens.push(token);

      if (type === '#' || type === '^') {
        sections.push(token);
      } else if (type === '/') {
        // Check section nesting.
        if (sections.length === 0) throw new Error('Unopened section "' + value + '" at ' + start);
        var openSection = sections.pop();
        if (openSection[1] !== value) throw new Error('Unclosed section "' + openSection[1] + '" at ' + start);
      } else if (type === 'name' || type === '{' || type === '&') {
        nonSpace = true;
      } else if (type === '=') {
        // Set the tags for the next time around.
        tags = value.split(spaceRe);
        if (tags.length !== 2) throw new Error('Invalid tags at ' + start + ': ' + tags.join(', '));
        tagRes = escapeTags(tags);
      }
    }

    // Make sure there are no open sections when we're done.
    var openSection = sections.pop();
    if (openSection) throw new Error('Unclosed section "' + openSection[1] + '" at ' + scanner.pos);

    tokens = squashTokens(tokens);

    return nestTokens(tokens);
  };

  // All Mustache.* functions use this writer.
  var _writer = new Writer();

  /**
   * Clears all cached templates and partials in the default writer.
   */
  exports.clearCache = function () {
    return _writer.clearCache();
  };

  /**
   * Compiles the given `template` to a reusable function using the default
   * writer.
   */
  exports.compile = function (template, tags) {
    return _writer.compile(template, tags);
  };

  /**
   * Compiles the partial with the given `name` and `template` to a reusable
   * function using the default writer.
   */
  exports.compilePartial = function (name, template, tags) {
    return _writer.compilePartial(name, template, tags);
  };

  /**
   * Compiles the given array of tokens (the output of a parse) to a reusable
   * function using the default writer.
   */
  exports.compileTokens = function (tokens, template) {
    return _writer.compileTokens(tokens, template);
  };

  /**
   * Renders the `template` with the given `view` and `partials` using the
   * default writer.
   */
  exports.render = function (template, view, partials) {
    return _writer.render(template, view, partials);
  };

  // This is here for backwards compatibility with 0.4.x.
  exports.to_html = function (template, view, partials, send) {
    var result = exports.render(template, view, partials);

    if (typeof send === "function") {
      send(result);
    } else {
      return result;
    }
  };

  return exports;

}())));


/* **********************************************
     Begin jquery.xdomainajax.js
********************************************** */

/**
 * jQuery.ajax mid - CROSS DOMAIN AJAX 
 * ---
 * @author James Padolsey (http://james.padolsey.com)
 * @version 0.11
 * @updated 12-JAN-10
 * ---
 * Note: Read the README!
 * ---
 * @info http://james.padolsey.com/javascript/cross-domain-requests-with-jquery/
 */

jQuery.ajax = (function(_ajax){
    
    var protocol = location.protocol,
        hostname = location.hostname,
        exRegex = RegExp(protocol + '//' + hostname),
        YQL = 'http' + (/^https/.test(protocol)?'s':'') + '://query.yahooapis.com/v1/public/yql?callback=?',
        query = 'select * from html where url="{URL}" and xpath="*"';
    
    function isExternal(url) {
        return !exRegex.test(url) && /:\/\//.test(url);
    }
    
    return function(o) {
        
        var url = o.url;
        
        if ( /get/i.test(o.type) && !/json/i.test(o.dataType) && isExternal(url) ) {
            
            // Manipulate options so that JSONP-x request is made to YQL
            
            o.url = YQL;
            o.dataType = 'json';
            
            o.data = {
                q: query.replace(
                    '{URL}',
                    url + (o.data ?
                        (/\?/.test(url) ? '&' : '?') + jQuery.param(o.data)
                    : '')
                ),
                format: 'xml'
            };
            
            // Since it's a JSONP request
            // complete === success
            if (!o.success && o.complete) {
                o.success = o.complete;
                delete o.complete;
            }
            
            o.success = (function(_success){
                return function(data) {
                    
                    if (_success) {
                        // Fake XHR callback.
                        _success.call(this, {
                            responseText: (data.results[0] || '')
                                // YQL screws with <script>s
                                // Get rid of them
                                .replace(/<script[^>]+?\/>|<script(.|\s)*?\/script>/gi, '')
                        }, 'success');
                    }
                    
                };
            })(o.success);
            
        }
        
        return _ajax.apply(this, arguments);
        
    };
    
})(jQuery.ajax);

/* **********************************************
     Begin scripts.js
********************************************** */

(function($) {
	var api_url_prefix     = 'https://api.typekit.com/edge_internal_v1/',
		font_include_url_prefix = '//use.edgefonts.net/',
		font_include_url_suffix = '.js',
		d                    = $.Deferred(),
		$picker              = $('#ewf-picker'),
		$toolbars            = $picker.find('.ewf-toolbars'),
		$results             = $picker.find('.ewf-results'),
		$page_font_name      = $('#page-font-notice').find('.current-font-name'),
		font_classifications = [
			{ class_name: 'serif',	   localized_name: 'Serif' },
			{ class_name: 'sans-serif',  localized_name: 'Sans-Serif' },
			{ class_name: 'slab-serif',  localized_name: 'Slab-Serif' },
			{ class_name: 'script',	  localized_name: 'Script' },
			{ class_name: 'blackletter', localized_name: 'Blackletter' },
			{ class_name: 'monospaced',  localized_name: 'Monospaced' },
			{ class_name: 'handmade',	localized_name: 'Handmade' },
			{ class_name: 'decorative',  localized_name: 'Decorative' }
		],
		font_recommendations = [
			 { class_name: 'headings',	localized_name: 'Headings' },
			 { class_name: 'paragraphs',  localized_name: 'Paragraphs' }
		],
		font_variations = [],
		font_families_map = [],
		font_filters = font_classifications.concat(font_recommendations),
		all_fonts,
		all_slugs,
		fonts_by_class,
		fonts_by_name,
		fonts_by_slug,
		i,
		the_family,
		search_timeout,
		is_active_page = false;

	// Initialize font variations
	for (i = 1; i <= 9; i++) {
		font_variations.push({class_name: 'n' + i, localized_name: i});
	}
	i = 0;

	// Initialize font_classifications to font_families map
	for (i = 0; i < font_classifications.length; i++) {
		if (font_classifications[i].class_name === 'serif' || font_classifications[i].class_name === 'slab-serif')
			the_family = 'serif';
		else if (font_classifications[i].class_name === 'sans-serif')
			the_family = 'sans-serif';
		else if (font_classifications[i].class_name === 'script' || font_classifications[i].class_name === 'handmade')
			the_family = 'cursive';
		else if (font_classifications[i].class_name === 'monospaced')
			the_family = 'monospace';
		else
			the_family = 'decorative';

		font_families_map[font_classifications[i].class_name] = the_family;
	}

	var updateFontEmbed = function(fonts) {
		var $font_embed = $('#font-embed-code').addClass('active'),
		    i;

		for (i = 0; i < fonts.length; i++) {
			$font_embed.find('.include-js').html('&lt;script src="' + font_include_url_prefix + fonts[i].slug + font_include_url_suffix + '"&gt;&lt;/script&gt;');
			$font_embed.find('.font-css').html('font-family: ' + fonts[i].slug + ', ' + font_families_map[fonts[i].classifications[0]] + ';');
			$font_embed.find('.font-name').html(fonts[i].name);
		}
	};

	var createInclude = function(fonts) {
		var i,
		    font_strings = [],
		    font_string;

		for (i = 0; i < fonts.length; i++) {
			font_string = fonts[i].slug;
			if (fonts[i].fvds) {
				font_string += ":" + fonts[i].fvds.join(",");
			}
			if (fonts[i].subset) {
				font_string += ":" + fonts[i].subset;
			}
			font_strings.push(font_string);
		}
		return '<script src="' + font_include_url_prefix + font_strings.join(";") + font_include_url_suffix + '"></script>';
	};

	/**
	 * Retrieve font metadata and set it up
	 */

	// Setup callback function for metadata request
	var organizeFamilies = function(families) {
		all_fonts = families.families;
		all_slugs = [];
		var i, j;

		// Clean up the fonts in two ways:
		//   1. give all fonts a locale lowercase name (for searching by name)
		//   2. make sure all slugs are lowercase (should be the case already)
		for (i = 0; i < all_fonts.length; i++) {
			all_fonts[i].lowerCaseName = all_fonts[i].name.toLocaleLowerCase();
			all_fonts[i].slug = all_fonts[i].slug.toLowerCase();
		}

		// We keep all_fonts in alphabetical order by name, so that all other lists will also be in order.
		all_fonts.sort(function (a, b) {
			if (a.lowerCaseName < b.lowerCaseName) {
				return -1;
			} else if (a.lowerCaseName > b.lowerCaseName) {
				return 1;
			} else { // They're equal
				return 0;
			}
		});

		// Setup the all_slugs array;
		for (i = 0; i < all_fonts.length; i++) {
			all_slugs.push(all_fonts[i].slug);
		}

		fonts_by_class = {};
		fonts_by_name = {};
		fonts_by_slug = {};

		for (i = 0; i < all_fonts.length; i++) {
			for (j = 0; j < all_fonts[i].classifications.length; j++) {
				if (!fonts_by_class.hasOwnProperty(all_fonts[i].classifications[j])) {
					fonts_by_class[all_fonts[i].classifications[j]] = [];
				}
				fonts_by_class[all_fonts[i].classifications[j]].push(all_fonts[i]);
			}
			for (j = 0; j < all_fonts[i].recommended_for.length; j++) {
				if (!fonts_by_class.hasOwnProperty(all_fonts[i].recommended_for[j])) {
					fonts_by_class[all_fonts[i].recommended_for[j]] = [];
				}
				fonts_by_class[all_fonts[i].recommended_for[j]].push(all_fonts[i]);
			}

			fonts_by_name[all_fonts[i].name] = all_fonts[i];
			fonts_by_slug[all_fonts[i].slug] = all_fonts[i];
		}
	};

	// Request font metadata
	$.ajax({
		url: api_url_prefix + 'families',
		type: 'GET',
		success: function (data) {
			// Using cross-domain-ajax jQuery plugin, which means data.responseText is an XML document
			var data_start = data.responseText.indexOf('{'),
				data_end = data.responseText.lastIndexOf('}') + 1,
				font_idx_mod = 1,
				font_idx,
				f,
				i;

			data = data.responseText.substring(data_start, data_end);

			if (!data.length) {
				d.reject('XHR request (using YQL) to "families" API failed');
				return false;
			}
			data = JSON.parse(data);
			organizeFamilies(data);
			// TODO: use jQuery Deferred + promise for this
			$results.html(Mustache.render($results.html(), {families: all_fonts}));
			// Choose a font for the page
			// Following logic chooses a random serif or sans-serif with at least 4 variations:
			font_idx = Math.round(Math.random() * all_fonts.length);
			if (font_idx > (all_fonts.length / 2))
				font_idx_mod = -1;

			do {
				f = all_fonts[font_idx];
				font_idx += font_idx_mod;
			} while (f.variations.length < 4 || (f.classifications[0] !== 'sans-serif' && f.classifications[0] !== 'serif'));
			// Following logic chooses a random 'headings' font:
			// font_idx = Math.round(Math.random() * fonts_by_class['headings'].length);
			// f = fonts_by_class['headings'][font_idx];

			// To create full script element for including a font (also works with more than one font):
			// if (f) {
			// 	for (i = 0; i < f.variations.length; i++) {
			// 		all_fvds.push(f.variations[i].fvd);
			// 	}
			// 	font_includes.push({slug: f.slug, fvds: all_fvds, subset: 'all'});
			// }
			// if (font_includes.length) {
			// 	$picker.prepend(createInclude(font_includes));
			// }

			// Load and set page font
			$page_font_name.html(f.name);
			$.getScript(font_include_url_prefix + f.slug + font_include_url_suffix, function() {
				var $html = $('html').css('fontFamily', f.slug);
				window.setTimeout(function() {
					$html.removeClass('preload');
				}, 350);
			});

			//d.resolve();
		},
		error: function () {
			d.reject('XHR request (using YQL) to "families" API failed');
		}
	});

	/**
	 * Setup toolbar buttons
	 */

	// Render font classifications, recommendations, and variations
	$toolbars.html(Mustache.render($toolbars.html(), {variations: font_variations, classifications: font_classifications, recommendations: font_recommendations}));

	// Add button handlers
	$('.ewf-classification-button').on('click', function() {
		var $button = $(this),
		    filter = $button.data('classification');

		// Deselect any other selected buttons in the same 'group' (ul)
		$button.closest('li').siblings().find('.selected').trigger('click');
		$results.toggleClass('filter-' + filter);
		$button.toggleClass('selected');
	});
	$('.ewf-search-fonts').on('keyup submit', function(evt) {
		var $search = $(this),
		    key = evt.keyCode,
		    timeout_duration = 500;

		// If the enter / return key was pressed
		if (key && key === 13)
			timeout_duration = 0;

		if (search_timeout)
			window.clearTimeout(search_timeout);

		search_timeout = window.setTimeout(function() {
			var name,
			    search_string = $search.val().toLowerCase();
			// Reset font matches
			$('.non-match').removeClass('non-match');
			// Identify non-matches
			for (name in fonts_by_name) {
				if (name.toLowerCase().indexOf(search_string) === -1)
					$('#' + fonts_by_name[name].slug).addClass('non-match');
			}
		}, timeout_duration);
	});

	// Font embed code toggle handler
	$('#font-embed-code').find('.toggle').on('click', function() {
		$('#font-embed-code').toggleClass('hidden');
	});

	// Set up font list listener
	$('.ewf-results').on('click', '.ewf-font', function() {
		var $font = $(this),
		    slug = this.id,
		    font = fonts_by_slug[slug],
		    is_activated = $.data(this, 'is_activated');

		$font.siblings('.active').removeClass('active');
		$font.addClass('active');

		if (is_activated) {
			$('#type-tester').css('font-family', slug);
			updateFontEmbed([font]);
		} else {
			$.data(this, 'is_activated', true);
			$.getScript(font_include_url_prefix + slug + font_include_url_suffix, function() {
				if (!is_active_page) {
					$('body').addClass('font-active');
					is_active_page = true;
				}
				updateFontEmbed([font]);
				// Give it some extra milliseconds to try to avoid FOUT
				window.setTimeout(function() {
					$('#type-tester').css('font-family', slug);
				}, 200);
			}).fail(function(jqxhr, settings, exception) {
				if (jqxhr.status === 404) {
					$font.addClass('error 404').append('<dl class="message"><dt>404</dt><dd>Could not load the font. It probably isn’t usable.</dd></dl>');
				}
			});
			$('#type-tester').addClass('active');
		}
	});
})(jQuery);