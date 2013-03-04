(function($) {
	var api_url_prefix     = 'https://api.typekit.com/edge_internal_v1/',
		font_include_url_prefix = '//use.edgefonts.net/',
		font_include_url_suffix = '.js',
		d        = $.Deferred(),
		$picker  = $('#ewf-picker'),
		$sidebar = $picker.find('.ewf-side-bar'),
		$results = $picker.find('.ewf-results'),
		font_classifications = [
			{ class_name: "serif",	   localized_name: "Serif" },
			{ class_name: "sans-serif",  localized_name: "Sans-Serif" },
			{ class_name: "slab-serif",  localized_name: "Slab-Serif" },
			{ class_name: "script",	  localized_name: "Script" },
			{ class_name: "blackletter", localized_name: "Blackletter" },
			{ class_name: "monospaced",  localized_name: "Monospaced" },
			{ class_name: "handmade",	localized_name: "Handmade" },
			{ class_name: "decorative",  localized_name: "Decorative" }
		],
		font_recommendations = [
			 { class_name: "headings",	localized_name: "Headings" },
			 { class_name: "paragraphs",  localized_name: "Paragraphs" }
		],
		font_filters = font_classifications.concat(font_recommendations),
		all_fonts,
		all_slugs,
		fonts_by_class,
		fonts_by_name,
		fonts_by_slug,
		i;

	/**
	 * Retrieve font metadata and set it up
	 */

	// Setup callback function for metadata request
	function organizeFamilies(families) {
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
	}
		
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
				f/*,
				i,
				font_includes = [],
				all_fvds = []*/;

			data = data.responseText.substring(data_start, data_end);

			if (!data.length) {
				d.reject('XHR request (using YQL) to "families" API failed');
				return false;
			}
			data = JSON.parse(data);
			organizeFamilies(data);
			// TODO: use jQuery Deferred + promise for this
			$results.html(Mustache.render($results.html(), {families: all_fonts}));
			// Choose a font for the page:
			// Following logic chooses any serif or sans-serif with more than one variation:
			font_idx = Math.round(Math.random() * all_fonts.length);
			if (font_idx > (all_fonts.length / 2))
				font_idx_mod = -1;

			do {
				f = all_fonts[font_idx];
				font_idx += font_idx_mod;
			} while (f.variations.length < 2 || (f.classifications[0] !== 'sans-serif' && f.classifications[0] !== 'serif'));
			// Following logic chooses a randow 'headings' font:
			font_idx = Math.round(Math.random() * fonts_by_class['headings'].length);
			console.log(fonts_by_class['headings'][font_idx]);
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
			$.getScript(font_include_url_prefix + f.slug + font_include_url_suffix, function() {
				var $html = $('html').css('fontFamily', f.slug);
				window.setTimeout(function() {
					$html.removeClass('preload');
				}, 150);
			});
			d.resolve();
		},
		error: function () {
			d.reject('XHR request (using YQL) to "families" API failed');
		}
	});

	/**
	 * Setup sidebar buttons
	 */

	// Render font classifications and recommendations
	$sidebar.html(Mustache.render($sidebar.html(), {classifications: font_classifications, recommendations: font_recommendations}));

	// Add button handlers
	$('.ewf-classification-button').on('click', function() {
		var $button = $(this),
		    filter = $button.data('classification');

		$results.toggleClass('filter-' + filter);
		$button.toggleClass('selected');
	});
	// for (i = 0; i < font_filters.length; i++) {
	// }

	/**
	 * Logic for font previewer from Adobe's Edge WebFonts page http://html.adobe.com/edge/webfonts/
	 */

	// Load initial font selection
	$.getScript("http://use.edgefonts.net/league-gothic.js");

	function setPreviouslySelectedFontFamilyName(n) {
		$('#fontSelector').data('previouslySelectedFontFamilyName', n);
	}

	setPreviouslySelectedFontFamilyName('league-gothic');
	$('#fontSelector').change(function() {
		var $selectedFontOption = $('#fontSelector option:selected'),
			selectedFontFamilyName = this.value;
		if ($selectedFontOption.data('loaded') === true) {
			$('#typeTester').css('font-family', selectedFontFamilyName);
			$('#edgeWebFontsScriptName').html(selectedFontFamilyName);
			$('#edgeWebFontsCSSName').html(selectedFontFamilyName);
			setPreviouslySelectedFontFamilyName(selectedFontFamilyName);
		} else {
			$.getScript("http://use.edgefonts.net/" + this.value + ".js", function() {
				$selectedFontOption.data('loaded', true);
				var fontFamilyStack = selectedFontFamilyName + ', ' + $('#fontSelector').data('previouslySelectedFontFamilyName');
				$('#typeTester').css('font-family', fontFamilyStack);
				$('#edgeWebFontsScriptName').html(selectedFontFamilyName);
				$('#edgeWebFontsCSSName').html(selectedFontFamilyName);
				setPreviouslySelectedFontFamilyName(selectedFontFamilyName);
			});
		}
	});

	function createInclude(fonts) {
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
	}
})(jQuery);