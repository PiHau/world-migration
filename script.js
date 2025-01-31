// script.js

(function() {
  // Déclarations Globales et Constantes
  let geoData;
  let migrationData;
  let correspondances;
  let popTotData;

  let popByM49Year = {};

  let selectedYear = 1990;
  let isChoroplethView = true;
  let selectedCountryCode = null;

  let anamorphMode = 'evolution';

  const aggregateCodes = new Set([
    "001", "947", "1833", "921", "1832", "1830", "1835", "927", "1829",
    "901", "902", "934", "948", "941", "1636", "1637", "1503", "1517",
    "1502", "1501", "1500", "903", "910", "911", "912", "913", "914",
    "935", "5500", "906", "920", "5501", "922", "908", "923", "924",
    "925", "926", "904", "900"
  ]);

  // Sélecteurs DOM
  const choroplethContainer = d3.select("#choropleth-map-container");
  const choroplethMap = choroplethContainer.select("#choropleth-map");
  const choroplethColorbar = choroplethContainer.select("#choropleth-colorbar");

  const anamorphicContainer = d3.select("#anamorphic-map-container");
  const anamorphicMap = anamorphicContainer.select("#anamorphic-map");
  const anamorphicColorbar = anamorphicContainer.select("#anamorphic-colorbar");

  const histogramContainer = d3.select("#evolution-plot-container");
  const evolutionPlot = histogramContainer.select("#evolution-plot");

  const barPlotContainer = d3.select("#barplot-container");
  const barPlot = barPlotContainer.select("#barplot");

  const choroplethYearSelect = document.getElementById("choropleth-year-select");
  const toggleMapBtn = document.getElementById("toggle-map");

  const anamorphicControls = document.getElementById("anamorphic-controls");
  const anamorphAbsoluteBtn = document.getElementById("anamorph-absolute-btn");
  const anamorphPercentageBtn = document.getElementById("anamorph-percentage-btn");
  const anamorphEvolutionBtn = document.getElementById("anamorph-evolution-btn");

  const evolutionYearControls = document.getElementById("evolution-year-controls");
  const evolutionYearSelect = document.getElementById("evolution-year-select");

  let selectedEvolutionRange = { start: 1990, end: 2020 };

  let tooltip = d3.select("#tooltip");

  const mapWidth = 800;
  const mapHeight = 500;

  const chartWidth = 300;
  const chartHeight = 210;
  const margin = { top: 20, right: 20, bottom: 50, left: 60 };

  // Variables pour stocker les catégories de colorbar
  let choroplethCategories = [];
  let anamorphicCategories = {
    absolute: [],
    percentage: [],
    evolution: []
  };

  // Initialisation après le chargement du DOM
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    setupEventListeners();
    loadData();
    addMapContainerClickListener();
  }

  // Configuration des écouteurs d'événements
  function setupEventListeners() {
    choroplethYearSelect.addEventListener("change", function() {
      selectedYear = +this.value;
      updateVisualization();
    });

    toggleMapBtn.addEventListener("click", function() {
      isChoroplethView = !isChoroplethView;
      toggleMapBtn.textContent = isChoroplethView ? "Afficher Carte Anamorphique" : "Afficher Carte Choroplèthe";

      choroplethContainer.classed("hidden", !isChoroplethView);
      anamorphicContainer.classed("hidden", isChoroplethView);
      anamorphicControls.classList.toggle("hidden", isChoroplethView);

      if (anamorphMode === 'evolution' && !isChoroplethView) {
        evolutionYearControls.classList.remove("hidden");
      } else {
        evolutionYearControls.classList.add("hidden");
      }

      updateVisualization();
    });

    anamorphAbsoluteBtn.addEventListener("click", function() {
      anamorphMode = 'absolute';
      anamorphAbsoluteBtn.classList.add("active");
      anamorphPercentageBtn.classList.remove("active");
      anamorphEvolutionBtn.classList.remove("active");

      evolutionYearControls.classList.add("hidden");
      updateAnamorphicMap();
      updateVisualization();
    });

    anamorphPercentageBtn.addEventListener("click", function() {
      anamorphMode = 'percentage';
      anamorphPercentageBtn.classList.add("active");
      anamorphAbsoluteBtn.classList.remove("active");
      anamorphEvolutionBtn.classList.remove("active");

      evolutionYearControls.classList.add("hidden");
      updateAnamorphicMap();
      updateVisualization();
    });

    anamorphEvolutionBtn.addEventListener("click", function() {
      anamorphMode = 'evolution';
      anamorphEvolutionBtn.classList.add("active");
      anamorphAbsoluteBtn.classList.remove("active");
      anamorphPercentageBtn.classList.remove("active");

      if (!isChoroplethView) {
        evolutionYearControls.classList.remove("hidden");
      } else {
        evolutionYearControls.classList.add("hidden");
      }

      updateAnamorphicMap();
      updateVisualization();
    });

    evolutionYearSelect.addEventListener("change", function() {
      const selectedRange = this.value;
      if (selectedRange === "1990-2020") {
        selectedEvolutionRange = { start: 1990, end: 2020 };
      } else {
        const [start, end] = selectedRange.split("-").map(Number);
        selectedEvolutionRange = { start, end };
      }
      updateVisualization();
    });
  }

  // Chargement des données
  function loadData() {
    const parseSemicolonCSV = d3.dsvFormat(";");

    Promise.all([
      d3.json("data/world.geojson"),
      d3.json("data/final_migration_data.json"),
      d3.text("data/correspondances.csv"),
      d3.json("data/pop_tot.json")
    ]).then(([geo, migration, correspondancesText, popTot]) => {
      geoData = geo;
      migrationData = migration;
      correspondances = processCorrespondances(parseSemicolonCSV.parse(correspondancesText));
      popTotData = popTot;

      processPopulationData();
      populateYearSelect();
      populateEvolutionYearSelect();

      initChoroplethMap();
      initAnamorphicMap();
      initBarPlot();
      initEvolutionPlot();

      initChoroplethColorbar();
      initAnamorphicColorbar();

      anamorphEvolutionBtn.classList.add("active");
      anamorphAbsoluteBtn.classList.remove("active");
      anamorphPercentageBtn.classList.remove("active");
      anamorphMode = 'evolution';

      if (!isChoroplethView) {
        evolutionYearControls.classList.remove("hidden");
      } else {
        evolutionYearControls.classList.add("hidden");
      }

      updateAnamorphicMap();
      updateVisualization();
    }).catch(err => console.error("Erreur lors du chargement des données :", err));
  }

  // Traitement des correspondances M49 et ISO3
  function processCorrespondances(data) {
    const m49ToISO3 = new Map();
    const ISO3ToM49 = new Map();
    const m49ToName = new Map();

    data.forEach(d => {
      const m49 = d["M49 Code"].trim();
      const iso3 = d["ISO-alpha3 Code"].trim();
      const name = d["Country or Area"].trim();
      if (m49 && iso3 && name && !aggregateCodes.has(m49)) {
        m49ToISO3.set(m49, iso3);
        ISO3ToM49.set(iso3, m49);
        m49ToName.set(m49, name);
      }
    });

    return { m49ToISO3, ISO3ToM49, m49ToName };
  }

  // Traitement des données de population
  function processPopulationData() {
    popTotData.forEach(country => {
      const iso3 = country["Country Code"].trim();
      const m49 = correspondances.ISO3ToM49.get(iso3);
      if (!m49 || aggregateCodes.has(m49)) return;
      for (let year = 1960; year <= 2023; year++) {
        const pop = country[year] ? +country[year] : 0;
        popByM49Year[`${m49}-${year}`] = pop;
      }
    });
  }

  // Remplissage du sélecteur d'années pour la choroplèthe
  function populateYearSelect() {
    const years = Array.from(new Set(migrationData.map(d => d.Year))).sort((a, b) => a - b);

    years.forEach(y => {
      if (y < 1990) return;
      const option = document.createElement("option");
      option.value = y;
      option.textContent = y;
      choroplethYearSelect.appendChild(option);
    });

    selectedYear = +choroplethYearSelect.value;
  }

  // Remplissage du sélecteur d'années pour l'évolution
  function populateEvolutionYearSelect() {
    const ranges = [
      "1990-1995",
      "1995-2000",
      "2000-2005",
      "2005-2010",
      "2010-2015",
      "2015-2020",
      "1990-2020"
    ];

    ranges.forEach(range => {
      const option = document.createElement("option");
      option.value = range;
      option.textContent = range;
      evolutionYearSelect.appendChild(option);
    });

    selectedEvolutionRange = { start: 1990, end: 2020 };
    evolutionYearSelect.value = "1990-2020";
  }

  // Initialisation de la carte choroplèthe
  function initChoroplethMap() {
    const svgChoro = choroplethMap.append("svg")
      .attr("width", "100%")
      .attr("height", "100%");

    const projection = d3.geoMercator()
      .scale(120)
      .translate([mapWidth / 2, mapHeight / 1.4]);
    const pathGenerator = d3.geoPath().projection(projection);

    // Création des chemins pour chaque pays
    svgChoro.selectAll(".country-choro")
      .data(geoData.features)
      .enter()
      .append("path")
      .attr("class", "country-choro")
      .attr("d", pathGenerator)
      .attr("stroke", "#2c3e50")
      .attr("stroke-width", 0.5)
      .on("mouseover", handleChoroplethMouseOver)
      .on("mousemove", handleMouseMove)
      .on("mouseout", handleMouseOut)
      .on("click", handleChoroplethClick);

    choroplethMap.projection = projection;
    choroplethMap.pathGenerator = pathGenerator;
  }

  // Mise à jour de la carte choroplèthe
  function updateChoroplethMap() {
    const svgChoro = choroplethMap.select("svg").selectAll(".country-choro");

    const percentageMap = calculateChoroplethPercentage();

    // Filtrage des pourcentages valides
    const validPercentageMap = new Map();
    percentageMap.forEach((pct, m49) => {
      if (pct <= 100 && !isNaN(pct)) {
        validPercentageMap.set(m49, pct);
      }
    });

    const dataForOutliers = Array.from(validPercentageMap.entries()).map(([m49, value]) => ({ m49, value }));
    const { nonOutliers, outliers } = detectOutliers(dataForOutliers, 'value');

    const filteredValues = Array.from(nonOutliers).filter(d => d > 0);

    if (filteredValues.length === 0) {
      console.warn("Aucune donnée disponible pour l'année sélectionnée.");
      svgChoro.attr("fill", "#f0f0f0");
      return;
    }

    // Définir les quantiles basés sur les valeurs non aberrantes
    const numClasses = 5;
    const colorScheme = d3.schemeBlues[numClasses];
    const quantileScale = d3.scaleQuantile()
      .domain(filteredValues)
      .range(colorScheme);

    const thresholds = quantileScale.quantiles();
    choroplethCategories = [];
    let previous = 0;
    thresholds.forEach(thresh => {
      choroplethCategories.push({ start: previous, end: thresh });
      previous = thresh;
    });
    choroplethCategories.push({ start: previous, end: d3.max(filteredValues) });

    // Création de l'échelle de couleur basée sur les catégories
    const colorScale = d3.scaleOrdinal()
      .domain(choroplethCategories.map((d, i) => i))
      .range(colorScheme);

    // Application des couleurs avec transition
    svgChoro.transition()
      .duration(600)
      .attr("fill", d => {
        const m49 = d.properties.iso_n3.toString();
        const pct = percentageMap.get(m49);

        if (pct > 100 || isNaN(pct)) {
          return "#d3d3d3"; // Couleur pour données invalides
        }

        if (pct === 0) {
          return "#ffffff"; // Blanc pour 0%
        }

        if (outliers.has(m49)) {
          return pct > d3.mean(filteredValues) ? d3.schemeBlues[numClasses][numClasses - 1] : d3.schemeBlues[numClasses][0];
        }

        // Trouver la catégorie à laquelle appartient la valeur
        const categoryIndex = choroplethCategories.findIndex(cat => pct > cat.start && pct <= cat.end);
        return colorScale(categoryIndex);
      });

    updateChoroplethColorbar(choroplethCategories, colorScheme);
  }

  // Initialisation de la carte anamorphique
  function initAnamorphicMap() {
    const svgAnamorph = anamorphicMap.append("svg")
      .attr("width", "100%")
      .attr("height", "100%");

    const projection = choroplethMap.projection;

    // Création des rectangles pour chaque pays
    svgAnamorph.selectAll(".country-square")
      .data(geoData.features.filter(d => !aggregateCodes.has(d.properties.iso_n3.toString())))
      .enter()
      .append("rect")
      .attr("class", "country-square")
      .attr("x", d => projection(d3.geoCentroid(d))[0] - 10)
      .attr("y", d => projection(d3.geoCentroid(d))[1] - 10)
      .attr("width", 20)
      .attr("height", 20)
      .attr("fill", "#1f78b4")
      .attr("opacity", 0.8)
      .on("mouseover", handleAnamorphicMouseOver)
      .on("mousemove", handleMouseMove)
      .on("mouseout", handleMouseOut)
      .on("click", handleAnamorphicClick);

    anamorphicMap.projection = projection;
  }

  // Mise à jour de la carte anamorphique
  function updateAnamorphicMap() {
    const svgAnamorph = anamorphicMap.select("svg").selectAll(".country-square");
    const projection = anamorphicMap.projection;

    let sizeScale;
    let colorScale;
    let categories;

    if (anamorphMode === 'absolute') {
      const valueMap = calculateAnamorphicValues();
      const data = Array.from(valueMap.entries()).map(([m49, value]) => ({ m49, value }));
      const validData = data.filter(d => {
        const population = popByM49Year[`${d.m49}-${selectedYear}`] || 0;
        const pct = (d.value / population) * 100;
        return pct <= 100;
      });

      const dataForOutliers = validData.map(d => ({ m49: d.m49, value: d.value }));
      const { nonOutliers, outliers } = detectOutliers(dataForOutliers, 'value');

      const filteredValues = Array.from(nonOutliers).filter(d => d > 0);

      if (filteredValues.length === 0) {
        console.warn("Aucune donnée non aberrante disponible pour la carte anamorphique en mode 'absolute'.");
        svgAnamorph.attr("fill", "#f0f0f0");
        return;
      }

      // Définir les quantiles basés sur les valeurs non aberrantes
      const numClasses = 5;
      const colorScheme = d3.schemeBlues[numClasses];
      const quantileScale = d3.scaleQuantile()
        .domain(filteredValues)
        .range(colorScheme);

      const thresholds = quantileScale.quantiles();
      categories = [];
      let previous = 0;
      thresholds.forEach(thresh => {
        categories.push({ start: previous, end: thresh });
        previous = thresh;
      });
      categories.push({ start: previous, end: d3.max(filteredValues) });

      anamorphicCategories.absolute = categories;

      // Création de l'échelle de couleur basée sur les catégories
      colorScale = d3.scaleOrdinal()
        .domain(categories.map((d, i) => i))
        .range(colorScheme);

      // Définir l'échelle de taille basée sur les valeurs non aberrantes
      sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(filteredValues)])
        .range([10, 60]);

      // Transition des rectangles
      svgAnamorph.transition()
        .duration(1000)
        .attr("width", d => {
          const m49 = d.properties.iso_n3.toString();
          const migrants = valueMap.get(m49) || 0;
          return outliers.has(m49) ? 60 : sizeScale(migrants);
        })
        .attr("height", d => {
          const m49 = d.properties.iso_n3.toString();
          const migrants = valueMap.get(m49) || 0;
          return outliers.has(m49) ? 60 : sizeScale(migrants);
        })
        .attr("x", d => {
          const centroid = projection(d3.geoCentroid(d));
          const m49 = d.properties.iso_n3.toString();
          const migrants = valueMap.get(m49) || 0;
          const size = outliers.has(m49) ? 60 : sizeScale(migrants);
          return centroid[0] - size / 2;
        })
        .attr("y", d => {
          const centroid = projection(d3.geoCentroid(d));
          const m49 = d.properties.iso_n3.toString();
          const migrants = valueMap.get(m49) || 0;
          const size = outliers.has(m49) ? 60 : sizeScale(migrants);
          return centroid[1] - size / 2;
        })
        .attr("fill", d => {
          const m49 = d.properties.iso_n3.toString();
          const migrants = valueMap.get(m49) || 0;

          const population = popByM49Year[`${m49}-${selectedYear}`] || 0;
          const pct = (migrants / population) * 100;
          if (pct > 100) {
            return "#d3d3d3";
          }

          if (outliers.has(m49)) {
            return migrants > d3.mean(filteredValues) ? d3.schemeBlues[numClasses][numClasses - 1] : d3.schemeBlues[numClasses][0];
          }

          // Trouver la catégorie à laquelle appartient la valeur
          const categoryIndex = categories.findIndex(cat => migrants > cat.start && migrants <= cat.end);
          return colorScale(categoryIndex);
        })
        .attr("opacity", 0.8);

    } else if (anamorphMode === 'percentage') {
      const percentageMap = calculateChoroplethPercentage();
      const data = Array.from(percentageMap.entries()).map(([m49, value]) => ({ m49, value }));
      const validData = data.filter(d => d.value <= 100 && !isNaN(d.value));

      const dataForOutliers = validData.map(d => ({ m49: d.m49, value: d.value }));
      const { nonOutliers, outliers } = detectOutliers(dataForOutliers, 'value');

      const filteredValues = Array.from(nonOutliers).filter(d => d > 0);

      if (filteredValues.length === 0) {
        console.warn("Aucune donnée non aberrante disponible pour la carte anamorphique en mode 'percentage'.");
        svgAnamorph.attr("fill", "#f0f0f0");
        return;
      }

      // Définir les quantiles basés sur les valeurs non aberrantes
      const numClasses = 5;
      const colorScheme = d3.schemeBlues[numClasses];
      const quantileScale = d3.scaleQuantile()
        .domain(filteredValues)
        .range(colorScheme);

      const thresholds = quantileScale.quantiles();
      categories = [];
      let previous = 0;
      thresholds.forEach(thresh => {
        categories.push({ start: previous, end: thresh });
        previous = thresh;
      });
      categories.push({ start: previous, end: d3.max(filteredValues) });

      anamorphicCategories.percentage = categories;

      // Création de l'échelle de couleur basée sur les catégories
      colorScale = d3.scaleOrdinal()
        .domain(categories.map((d, i) => i))
        .range(colorScheme);

      // Définir l'échelle de taille basée sur les valeurs non aberrantes
      sizeScale = d3.scaleLinear()
        .domain([0, d3.max(filteredValues)])
        .range([10, 60]);

      // Transition des rectangles
      svgAnamorph.transition()
        .duration(1000)
        .attr("width", d => {
          const m49 = d.properties.iso_n3.toString();
          const pct = percentageMap.get(m49) || 0;
          return outliers.has(m49) ? 60 : sizeScale(pct);
        })
        .attr("height", d => {
          const m49 = d.properties.iso_n3.toString();
          const pct = percentageMap.get(m49) || 0;
          return outliers.has(m49) ? 60 : sizeScale(pct);
        })
        .attr("x", d => {
          const centroid = projection(d3.geoCentroid(d));
          const m49 = d.properties.iso_n3.toString();
          const pct = percentageMap.get(m49) || 0;
          const size = outliers.has(m49) ? 60 : sizeScale(pct);
          return centroid[0] - size / 2;
        })
        .attr("y", d => {
          const centroid = projection(d3.geoCentroid(d));
          const m49 = d.properties.iso_n3.toString();
          const pct = percentageMap.get(m49) || 0;
          const size = outliers.has(m49) ? 60 : sizeScale(pct);
          return centroid[1] - size / 2;
        })
        .attr("fill", d => {
          const m49 = d.properties.iso_n3.toString();
          const pct = percentageMap.get(m49) || 0;

          if (pct > 100) {
            return "#d3d3d3";
          }

          if (outliers.has(m49)) {
            return pct > d3.mean(filteredValues) ? d3.schemeBlues[numClasses][numClasses - 1] : d3.schemeBlues[numClasses][0];
          }

          // Trouver la catégorie à laquelle appartient la valeur
          const categoryIndex = categories.findIndex(cat => pct > cat.start && pct <= cat.end);
          return colorScale(categoryIndex);
        })
        .attr("opacity", 0.8);

    } else if (anamorphMode === 'evolution') {
      const evolutionMap = calculateEvolutionPercentageValues();
      const data = Array.from(evolutionMap.entries()).map(([m49, value]) => ({ m49, value: Math.abs(value) }));
      const validData = data.filter(d => {
        const population = popByM49Year[`${d.m49}-${selectedYear}`] || 0;
        const pct = (d.value / population) * 100;
        return pct <= 100 && d.value !== 0;
      });

      const dataForOutliers = validData.map(d => ({ m49: d.m49, value: d.value }));
      const { nonOutliers, outliers } = detectOutliers(dataForOutliers, 'value');

      const filteredValues = Array.from(nonOutliers).filter(d => d > 0);

      if (filteredValues.length === 0) {
        console.warn("Aucune donnée non aberrante disponible pour la carte anamorphique en mode 'evolution'.");
        svgAnamorph.attr("fill", "#f0f0f0");
        return;
      }

      // Définir les quantiles basés sur les valeurs non aberrantes
      const numClasses = 5;
      const colorScheme = d3.schemeRdBu[numClasses];
      const quantileScale = d3.scaleQuantile()
        .domain(filteredValues)
        .range(colorScheme);

      const thresholds = quantileScale.quantiles();
      categories = [];
      let previous = -d3.max(filteredValues);
      thresholds.forEach(thresh => {
        categories.push({ start: previous, end: thresh });
        previous = thresh;
      });
      categories.push({ start: previous, end: d3.max(filteredValues) });

      anamorphicCategories.evolution = categories;

      // Création de l'échelle de couleur basée sur les catégories
      colorScale = d3.scaleOrdinal()
        .domain(categories.map((d, i) => i))
        .range(colorScheme);

      // Définir l'échelle de taille basée sur les valeurs non aberrantes
      sizeScale = d3.scalePow()
        .exponent(2)
        .domain([0, d3.max(filteredValues)])
        .range([10, 60]);

      // Transition des rectangles
      svgAnamorph.transition()
        .duration(1000)
        .attr("width", d => {
          const m49 = d.properties.iso_n3.toString();
          const evolution = evolutionMap.get(m49) || 0;
          const absEvolution = Math.abs(evolution);
          return outliers.has(m49) ? 60 : sizeScale(absEvolution);
        })
        .attr("height", d => {
          const m49 = d.properties.iso_n3.toString();
          const evolution = evolutionMap.get(m49) || 0;
          const absEvolution = Math.abs(evolution);
          return outliers.has(m49) ? 60 : sizeScale(absEvolution);
        })
        .attr("x", d => {
          const centroid = projection(d3.geoCentroid(d));
          const m49 = d.properties.iso_n3.toString();
          const evolution = evolutionMap.get(m49) || 0;
          const absEvolution = Math.abs(evolution);
          const size = outliers.has(m49) ? 60 : sizeScale(absEvolution);
          return centroid[0] - size / 2;
        })
        .attr("y", d => {
          const centroid = projection(d3.geoCentroid(d));
          const m49 = d.properties.iso_n3.toString();
          const evolution = evolutionMap.get(m49) || 0;
          const absEvolution = Math.abs(evolution);
          const size = outliers.has(m49) ? 60 : sizeScale(absEvolution);
          return centroid[1] - size / 2;
        })
        .attr("fill", d => {
          const m49 = d.properties.iso_n3.toString();
          const evolution = evolutionMap.get(m49) || 0;

          const population = popByM49Year[`${m49}-${selectedYear}`] || 0;
          const pct = (evolution / population) * 100;
          if (pct > 100) {
            return "#d3d3d3";
          }

          if (outliers.has(m49)) {
            return evolution > 0 ? d3.schemeRdBu[numClasses][numClasses - 1] : d3.schemeRdBu[numClasses][0];
          }

          // Trouver la catégorie à laquelle appartient la valeur
          const categoryIndex = categories.findIndex(cat => evolution > cat.start && evolution <= cat.end);
          return colorScale(categoryIndex);
        })
        .attr("opacity", 0.8);
    }

    updateAnamorphicColorbar(anamorphMode);
  }

  // Initialisation des colorbars
  function initChoroplethColorbar() {
    const colorbarContainer = choroplethColorbar;
    colorbarContainer.selectAll(".colorbar-rect").remove();
  }

  function initAnamorphicColorbar() {
    const colorbarContainer = anamorphicColorbar;
    colorbarContainer.selectAll(".colorbar-rect").remove();
  }

  // Mise à jour de la colorbar choroplèthe
  function updateChoroplethColorbar(categories, colorScheme) {
    const colorbarContainer = choroplethColorbar;
    colorbarContainer.selectAll(".colorbar-rect").remove();

    categories.forEach((cat, i) => {
      colorbarContainer.append("div")
        .attr("class", "colorbar-rect")
        .style("background-color", colorScheme[i])
        .style("color", "#000000")
        .text(`${cat.start.toFixed(2)}% - ${cat.end.toFixed(2)}%`)
        .style("cursor", "default")
        .style("pointer-events", "none");
    });
  }

  // Mise à jour de la colorbar anamorphique
  function updateAnamorphicColorbar(mode) {
    const colorbarContainer = anamorphicColorbar;
    colorbarContainer.selectAll(".colorbar-rect").remove();

    if (mode === 'absolute') {
      const categories = anamorphicCategories.absolute;
      const colorScheme = d3.schemeBlues[categories.length] || d3.schemeBlues[5];

      categories.forEach((cat, i) => {
        colorbarContainer.append("div")
          .attr("class", "colorbar-rect")
          .style("background-color", colorScheme[i])
          .style("color", "#000000")
          .text(`${(cat.start / 1e6).toFixed(1)}M - ${(cat.end / 1e6).toFixed(1)}M Migrants`)
          .style("cursor", "default")
          .style("pointer-events", "none");
      });

    } else if (mode === 'percentage') {
      const categories = anamorphicCategories.percentage;
      const colorScheme = d3.schemeBlues[categories.length] || d3.schemeBlues[5];

      categories.forEach((cat, i) => {
        colorbarContainer.append("div")
          .attr("class", "colorbar-rect")
          .style("background-color", colorScheme[i])
          .style("color", "#000000")
          .text(`${Math.round(cat.start)}% - ${Math.round(cat.end)}% Migrants`)
          .style("cursor", "default")
          .style("pointer-events", "none");
      });

    } else if (mode === 'evolution') {
      const categories = anamorphicCategories.evolution;
      const colorScheme = d3.schemeRdBu[categories.length] || d3.schemeRdBu[5];
      const colorScale = d3.scaleOrdinal()
        .domain(categories.map((d, i) => i))
        .range(colorScheme);

      categories.forEach((cat, i) => {
        colorbarContainer.append("div")
          .attr("class", "colorbar-rect")
          .style("background-color", colorScale(i))
          .style("color", "#000000")
          .text(`${cat.start.toFixed(1)}% - ${cat.end.toFixed(1)}%`)
          .style("cursor", "default")
          .style("pointer-events", "none");
      });
    }
  }

  // Calcul du pourcentage pour la choroplèthe
  function calculateChoroplethPercentage() {
    const percentageMap = new Map();

    migrationData.forEach(d => {
      if (d.Year !== selectedYear) return;

      const destination = d.destination_code.toString().padStart(3, '0');
      const origin = d.origin_code.toString().padStart(3, '0');
      const migrants = parseNumber(d.number_of_migrants);

      if (aggregateCodes.has(destination) || aggregateCodes.has(origin)) return;

      if (!percentageMap.has(destination)) {
        percentageMap.set(destination, migrants);
      } else {
        percentageMap.set(destination, percentageMap.get(destination) + migrants);
      }
    });

    // Calcul du pourcentage par pays
    percentageMap.forEach((flux, m49) => {
      const popKey = `${m49}-${selectedYear}`;
      const population = popByM49Year[popKey] || 0;
      const percentage = (population > 0) ? (flux / population) * 100 : 0;

      if (percentage > 100) {
        percentageMap.set(m49, NaN);
      } else {
        percentageMap.set(m49, percentage);
      }
    });

    return percentageMap;
  }

  // Calcul des valeurs anamorphiques absolues
  function calculateAnamorphicValues() {
    const valueMap = new Map();

    migrationData.forEach(d => {
      if (d.Year !== selectedYear) return;

      const destination = d.destination_code.toString().padStart(3, '0');
      const origin = d.origin_code.toString().padStart(3, '0');
      const migrants = parseNumber(d.number_of_migrants);

      if (aggregateCodes.has(destination) || aggregateCodes.has(origin)) return;

      const targetCode = destination;

      if (!valueMap.has(targetCode)) {
        valueMap.set(targetCode, migrants);
      } else {
        valueMap.set(targetCode, valueMap.get(targetCode) + migrants);
      }
    });

    return valueMap;
  }

  // Calcul des valeurs d'évolution en pourcentage
  function calculateEvolutionPercentageValues() {
    const evolutionMap = new Map();

    const startYear = selectedEvolutionRange.start;
    const endYear = selectedEvolutionRange.end;

    const percentageMapStart = calculateChoroplethPercentageForYear(startYear);
    const percentageMapEnd = calculateChoroplethPercentageForYear(endYear);

    percentageMapEnd.forEach((pctEnd, m49) => {
      const pctStart = percentageMapStart.get(m49) || 0;
      const evolution = pctEnd - pctStart;
      evolutionMap.set(m49, evolution);
    });

    return evolutionMap;
  }

  // Calcul du pourcentage pour une année spécifique
  function calculateChoroplethPercentageForYear(year) {
    const percentageMap = new Map();

    migrationData.forEach(d => {
      if (d.Year !== year) return;

      const destination = d.destination_code.toString().padStart(3, '0');
      const origin = d.origin_code.toString().padStart(3, '0');
      const migrants = parseNumber(d.number_of_migrants);

      if (aggregateCodes.has(destination) || aggregateCodes.has(origin)) return;

      if (!percentageMap.has(destination)) {
        percentageMap.set(destination, migrants);
      } else {
        percentageMap.set(destination, percentageMap.get(destination) + migrants);
      }
    });

    percentageMap.forEach((flux, m49) => {
      const popKey = `${m49}-${year}`;
      const population = popByM49Year[popKey] || 0;
      const percentage = (population > 0) ? (flux / population) * 100 : 0;

      if (percentage > 100) {
        percentageMap.set(m49, NaN);
      } else {
        percentageMap.set(m49, percentage);
      }
    });

    return percentageMap;
  }

  // Initialisation du barplot
  function initBarPlot() {
    const svgBar = barPlot.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    svgBar.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0, ${chartHeight - margin.top - margin.bottom})`);

    svgBar.append("g")
      .attr("class", "y-axis");
  }

  // Mise à jour du barplot
  function updateBarPlot(countryCode) {
    const svgBar = barPlot.select("svg").select("g");
    svgBar.selectAll("*").remove();

    if (!countryCode) {
      svgBar.append("text")
        .attr("x", (chartWidth - margin.left - margin.right) / 2)
        .attr("y", (chartHeight - margin.top - margin.bottom) / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#555")
        .text("Sélectionnez un pays pour afficher les données");
      return;
    }

    const isEntrants = migrationData.some(d => d.Year === selectedYear && d.destination_code.toString().padStart(3, '0') === countryCode);

    const dataFiltered = migrationData.filter(d => d.Year === selectedYear && (
      (isEntrants && d.destination_code.toString().padStart(3, '0') === countryCode) ||
      (!isEntrants && d.origin_code.toString().padStart(3, '0') === countryCode)
    )).filter(d => 
      !aggregateCodes.has(d.origin_code.toString().padStart(3, '0')) &&
      !aggregateCodes.has(d.destination_code.toString().padStart(3, '0'))
    );

    const fluxMap = d3.rollups(
      dataFiltered,
      v => d3.sum(v, d => parseNumber(d.number_of_migrants)),
      d => isEntrants ? d.origin_code.toString().padStart(3, '0') : d.destination_code.toString().padStart(3, '0')
    ).map(([code, val]) => ({ code, val }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 10);

    if (fluxMap.length === 0) {
      svgBar.append("text")
        .attr("x", (chartWidth - margin.left - margin.right) / 2)
        .attr("y", (chartHeight - margin.top - margin.bottom) / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#555")
        .text("Aucune donnée disponible");
      return;
    }

    const total = d3.sum(fluxMap, d => d.val);
    const percentages = fluxMap.map(d => ({
      code: d.code,
      percentage: (d.val / total) * 100
    }));

    const xScale = d3.scaleBand()
      .domain(percentages.map(d => correspondances.m49ToName.get(d.code) || "Inconnu"))
      .range([0, chartWidth - margin.left - margin.right])
      .padding(0.1);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(percentages, d => d.percentage) || 0])
      .range([chartHeight - margin.top - margin.bottom, 0]);

    const barColor = "#1f78b4";

    // Axe X
    svgBar.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0, ${chartHeight - margin.top - margin.bottom})`)
      .call(d3.axisBottom(xScale))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .attr("fill", "#2c3e50");

    // Axe Y
    svgBar.append("g")
      .attr("class", "y-axis")
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${d.toFixed(2)}%`))
      .selectAll("text")
      .attr("fill", "#2c3e50");

    // Création des barres
    svgBar.selectAll(".bar")
      .data(percentages)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => xScale(correspondances.m49ToName.get(d.code) || "Inconnu"))
      .attr("y", chartHeight - margin.top - margin.bottom)
      .attr("width", xScale.bandwidth())
      .attr("height", 0)
      .attr("fill", barColor)
      .on("mouseover", (event, d) => {
        const name = correspondances.m49ToName.get(d.code) || "Inconnu";
        tooltip.style("visibility", "visible")
          .html(`<b>${name}</b><br>Pourcentage Migrants : ${formatPct(d.percentage)}%`);
      })
      .on("mousemove", handleMouseMove)
      .on("mouseout", handleMouseOut)
      .transition()
      .duration(800)
      .attr("y", d => yScale(d.percentage))
      .attr("height", d => (chartHeight - margin.top - margin.bottom) - yScale(d.percentage));
  }

  // Initialisation du graphique d'évolution
  function initEvolutionPlot() {
    const svgEvolution = evolutionPlot.append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    svgEvolution.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0, ${chartHeight - margin.top - margin.bottom})`);

    svgEvolution.append("g")
      .attr("class", "y-axis");
  }

  // Mise à jour du graphique d'évolution
  function updateEvolutionPlot(countryCode) {
    const svgEvolution = evolutionPlot.select("svg").select("g");
    svgEvolution.selectAll("*").remove();

    if (!countryCode) {
      svgEvolution.append("text")
        .attr("x", (chartWidth - margin.left - margin.right) / 2)
        .attr("y", (chartHeight - margin.top - margin.bottom) / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#555")
        .text("Sélectionnez un pays pour afficher l'évolution des migrants");
      return;
    }

    const isEntrants = migrationData.some(d => d.Year === selectedYear && d.destination_code.toString().padStart(3, '0') === countryCode);

    const startYear = 1990;
    const endYear = 2020;
    const years = d3.range(startYear, endYear + 1, 5);

    const timeseries = years.map(y => {
      const dataYear = migrationData.filter(d => d.Year === y && (
        (isEntrants && d.destination_code.toString().padStart(3, '0') === countryCode) ||
        (!isEntrants && d.origin_code.toString().padStart(3, '0') === countryCode)
      )).filter(d => 
        !aggregateCodes.has(d.origin_code.toString().padStart(3, '0')) &&
        !aggregateCodes.has(d.destination_code.toString().padStart(3, '0'))
      );

      const flux = d3.sum(dataYear, d => parseNumber(d.number_of_migrants));
      return { year: y, flux };
    }).filter(d => d.flux > 0);

    const timeseriesInMillions = timeseries.map(d => ({
      year: d.year,
      flux: d.flux / 1e6
    }));

    if (timeseriesInMillions.length === 0) {
      svgEvolution.append("text")
        .attr("x", (chartWidth - margin.left - margin.right) / 2)
        .attr("y", (chartHeight - margin.top - margin.bottom) / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#555")
        .text("Aucune donnée disponible");
      return;
    }

    const xScale = d3.scaleLinear()
      .domain([startYear, endYear])
      .range([0, chartWidth - margin.left - margin.right]);

    const yMax = d3.max(timeseriesInMillions, d => d.flux) || 0;
    const yScale = d3.scaleLinear()
      .domain([0, yMax])
      .range([chartHeight - margin.top - margin.bottom, 0]);

    const lineColor = "#1f78b4";
    const pointColor = "#a6cee3";

    // Axe X
    svgEvolution.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0, ${chartHeight - margin.top - margin.bottom})`)
      .call(d3.axisBottom(xScale).tickValues(d3.range(startYear, endYear + 1, 5)).tickFormat(d3.format("d")))
      .selectAll("text")
      .attr("fill", "#2c3e50");

    // Axe Y
    svgEvolution.append("g")
      .attr("class", "y-axis")
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${d.toFixed(2)}M`))
      .selectAll("text")
      .attr("fill", "#2c3e50");

    // Ligne de tendance
    const line = d3.line()
      .x(d => xScale(d.year))
      .y(d => yScale(d.flux));

    svgEvolution.append("path")
      .datum(timeseriesInMillions)
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", lineColor)
      .attr("stroke-width", 2)
      .attr("d", line)
      .attr("stroke-dasharray", function() { 
        const totalLength = this.getTotalLength(); 
        return `${totalLength} ${totalLength}`; 
      })
      .attr("stroke-dashoffset", function() { return this.getTotalLength(); })
      .transition()
      .duration(1000)
      .attr("stroke-dashoffset", 0);

    // Points sur la ligne
    svgEvolution.selectAll(".dot")
      .data(timeseriesInMillions)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", d => xScale(d.year))
      .attr("cy", d => yScale(d.flux))
      .attr("r", 0)
      .attr("fill", pointColor)
      .on("mouseover", (event, d) => {
        tooltip.style("visibility", "visible")
          .html(`Année ${d.year} : ${formatPct(d.flux)}M Migrants`);
      })
      .on("mousemove", handleMouseMove)
      .on("mouseout", handleMouseOut)
      .transition()
      .duration(800)
      .attr("r", 4);
  }

  // Mise à jour de la visualisation globale
  function updateVisualization() {
    if (isChoroplethView) {
      updateChoroplethMap();
    } else {
      updateAnamorphicMap();
    }

    updateAnamorphicColorbar(anamorphMode);

    if (selectedCountryCode) {
      updateBarPlot(selectedCountryCode);
      updateEvolutionPlot(selectedCountryCode);
    } else {
      clearCharts();
    }
  }

  // Effacement des graphiques
  function clearCharts() {
    barPlot.select("svg").select("g").selectAll("*").remove();
    initBarPlot();

    evolutionPlot.select("svg").select("g").selectAll("*").remove();
    initEvolutionPlot();
  }

  // Parsing des nombres
  function parseNumber(str) {
    if (!str) return 0;
    return parseInt(str.replace(/\s+/g, ""), 10) || 0;
  }

  const formatPct = d3.format(".2f");

  // Gestion du survol sur la choroplèthe
  function handleChoroplethMouseOver(event, d) {
    const m49 = d.properties.iso_n3.toString().padStart(3, '0');
    const name = correspondances.m49ToName.get(m49) || "Pays inconnu";

    const percentageMap = calculateChoroplethPercentage();
    const percentage = percentageMap.get(m49);

    if (isNaN(percentage)) {
      tooltip.style("visibility", "visible")
        .html(`<b>${name}</b><br>Pas de données`);
    } else if (percentage === 0) {
      tooltip.style("visibility", "visible")
        .html(`<b>${name}</b><br>No Data`);
    } else {
      tooltip.style("visibility", "visible")
        .html(`<b>${name}</b><br>Population étrangère : ${formatPct(percentage)}%`);
    }
  }

  // Gestion du clic sur la choroplèthe
  function handleChoroplethClick(event, d) {
    event.stopPropagation();
    const m49 = d.properties.iso_n3.toString().padStart(3, '0');
    selectedCountryCode = (selectedCountryCode === m49) ? null : m49;
    updateVisualization();
  }

  // Gestion du survol sur la carte anamorphique
  function handleAnamorphicMouseOver(event, d) {
    const m49 = d.properties.iso_n3.toString().padStart(3, '0');
    const name = correspondances.m49ToName.get(m49) || "Pays inconnu";

    let tooltipContent = `<b>${name}</b><br>`;

    if (anamorphMode === 'absolute') {
      const valueMap = calculateAnamorphicValues();
      const migrants = valueMap.get(m49) || 0;
      const population = popByM49Year[`${m49}-${selectedYear}`] || 0;
      const pct = (migrants / population) * 100;
      if (pct > 100) {
        tooltipContent += `Pas de données<br>`;
      } else {
        const migrantsMillions = (migrants / 1e6).toFixed(2);
        tooltipContent += `Migrants : ${migrantsMillions}M<br>`;
      }
    }

    if (anamorphMode === 'percentage') {
      const percentageMap = calculateChoroplethPercentage();
      const pct = percentageMap.get(m49) || 0;
      if (isNaN(pct)) {
        tooltipContent += `Pas de données<br>`;
      } else {
        tooltipContent += `Pourcentage Migrants : ${formatPct(pct)}%<br>`;
      }
    }

    if (anamorphMode === 'evolution') {
      const evolutionMap = calculateEvolutionPercentageValues();
      const evolution = evolutionMap.get(m49) || 0;
      const population = popByM49Year[`${m49}-${selectedYear}`] || 0;
      const pct = (evolution / population) * 100;
      if (pct > 100) {
        tooltipContent += `Pas de données<br>`;
      } else {
        tooltipContent += `Évolution Migrants : ${formatPct(evolution)}%<br>`;
        const percentageMap = calculateChoroplethPercentage();
        const pctFinal = percentageMap.get(m49) || 0;
        tooltipContent += `Pourcentage Migrants : ${formatPct(pctFinal)}%`;
      }
    }

    tooltip.style("visibility", "visible")
      .html(tooltipContent);
  }

  // Gestion du clic sur la carte anamorphique
  function handleAnamorphicClick(event, d) {
    event.stopPropagation();
    const m49 = d.properties.iso_n3.toString().padStart(3, '0');
    selectedCountryCode = (selectedCountryCode === m49) ? null : m49;
    updateVisualization();
  }

  // Gestion du déplacement de la souris
  function handleMouseMove(event) {
    tooltip
      .style("top", (event.pageY + 10) + "px")
      .style("left", (event.pageX + 10) + "px");
  }

  // Gestion de la sortie de la souris
  function handleMouseOut() {
    tooltip.style("visibility", "hidden");
  }

  // Gestion du clic en dehors des cartes pour désélectionner
  function addMapContainerClickListener() {
    d3.select("#map-container").on("click", function(event) {
      const target = event.target;
      if (target.tagName.toLowerCase() !== 'path' && target.tagName.toLowerCase() !== 'rect') {
        selectedCountryCode = null;
        updateVisualization();
      }
    });
  }

  // Détection des valeurs aberrantes
  function detectOutliers(data, key) {
    const values = data.map(d => d[key]);
    const mean = d3.mean(values);
    const stdDev = d3.deviation(values) || 0;

    const nonOutliers = new Set();
    const outliers = new Set();

    data.forEach(d => {
      const zScore = (d[key] - mean) / stdDev;
      if (Math.abs(zScore) > 2) {
        outliers.add(d.m49);
      } else {
        nonOutliers.add(d[key]);
      }
    });

    return { nonOutliers, outliers };
  }

})();
