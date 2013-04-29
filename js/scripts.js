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

	var createInclude = function(fonts, src_only) {
		var i,
		    font_strings = [],
		    font_string,
		    font_src;

		src_only = !!src_only;

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
		font_src = font_include_url_prefix + font_strings.join(";") + font_include_url_suffix;

		if (src_only)
			return font_src;
		else
			return '<script src="' + font_src + '"></script>';
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
				f_src,
				f_includes = [],
				all_fvds = [],
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
			if (f) {
				for (i = 0; i < f.variations.length; i++) {
					all_fvds.push(f.variations[i].fvd);
				}
				f_includes.push({slug: f.slug, fvds: all_fvds, subset: 'all'});
			}
			if (f_includes.length) {
				//$picker.prepend(createInclude(f_includes));
				f_src = createInclude(f_includes, true);
			} else {
				f_src = font_include_url_prefix + f.slug + font_include_url_suffix;
			}

			// Load and set page font
			$page_font_name.html(f.name);
			$.getScript(f_src, function() {
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