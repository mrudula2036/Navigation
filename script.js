const openRouteServiceApiKey = '5b3ce3597851110001cf62483560f884907b4923be76f2578ce63ac4';
const mapboxApiKey = 'sk.eyJ1IjoibXJ1ZHVsYTAyOSIsImEiOiJjbHl3cG5oMzIwdmltMmpzYmloZmhrdXRkIn0.30WpGD8FVuJj7bcNgiZiMg';

let map;
let userLocation;
let routeLayer;
let startPoint;
let endPoint;
let selectedMode = 'walking'; // Default mode to walking
let favorites = {};
let startMarker;
let endMarker;
let directions;

function initMap() {
    map = L.map('map').setView([0, 0], 13); // Default center and zoom

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    locateUser();

    mapboxgl.accessToken = mapboxApiKey;
    map.on('load', function() {
        directions = new MapboxDirections({
            accessToken: mapboxApiKey,
            unit: 'metric',
            profile: selectedMode === 'walking' ? 'mapbox/walking' : selectedMode === 'cycling' ? 'mapbox/cycling' : 'mapbox/driving'
        });

        map.addControl(directions, 'top-left');

        directions.on('route', (event) => {
            const route = event.route[0];
            const distance = route.distance / 1000; // in kilometers
            const duration = route.duration / 60; // in minutes
            document.getElementById('time-estimates').innerHTML = `
                <div><strong>${selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)}:</strong> ${Math.round(distance)} km / ${Math.round(duration)} min</div>
            `;
        });

        directions.on('routev2', (event) => {
            const { directions: routeDirections } = event;
            if (routeDirections) {
                document.getElementById('instructions').innerHTML = '';
                routeDirections.forEach((step, index) => {
                    const instruction = step.maneuver.instruction;
                    document.getElementById('instructions').innerHTML += `<div>${index + 1}. ${instruction}</div>`;
                });
            }
        });

        if (startPoint && endPoint) {
            directions.setOrigin(startPoint);
            directions.setDestination(endPoint);
        }
    });
}

function locateUser() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            userLocation = [position.coords.latitude, position.coords.longitude];
            startPoint = userLocation;

            map.setView(userLocation, 14);

            L.marker(userLocation, {
                icon: L.divIcon({
                    className: 'glowing-circle',
                    iconSize: [24, 24]
                })
            }).addTo(map)
                .bindPopup('You are here!')
                .openPopup();

            L.circle(userLocation, { radius: 200 }).addTo(map);

            startTracking();
        }, (error) => {
            console.error('Error getting location: ', error);
            alert('Unable to retrieve your location.');
        });
    } else {
        console.error('Geolocation is not supported by this browser.');
        alert('Geolocation is not supported by this browser.');
    }
}

function startTracking() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((position) => {
            userLocation = [position.coords.latitude, position.coords.longitude];
            updateMarker('start');

            if (directions) {
                if (startPoint && endPoint) {
                    calculateRoute();
                }
            }
        }, (error) => {
            console.error('Error tracking location: ', error);
        }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 });
    } else {
        console.error('Geolocation is not supported by this browser.');
    }
}

function fetchNearbySuggestions(query, type) {
    if (!userLocation) {
        alert('Current location not available.');
        return;
    }

    const [lat, lon] = userLocation;
    const radius = 1000; // Search within 1 km radius

    const encodedQuery = encodeURIComponent(query);

    const favoritesMatches = Object.entries(favorites).filter(([name, location]) =>
        name.toLowerCase().includes(query.toLowerCase())
    );

    if (favoritesMatches.length > 0) {
        const suggestions = type === 'start' ? document.getElementById('start-suggestions') : document.getElementById('destination-suggestions');
        suggestions.innerHTML = '';

        favoritesMatches.forEach(([name, location]) => {
            const div = document.createElement('div');
            div.textContent = name;
            div.onclick = () => {
                if (type === 'start') {
                    document.getElementById('start').value = name;
                    startPoint = location;
                    updateMarker('start');
                } else {
                    document.getElementById('destination').value = name;
                    endPoint = location;
                    updateMarker('destination');
                }
                suggestions.innerHTML = '';
                calculateRoute(); 
                autoNavigate(); // Automatically navigate
            };
            suggestions.appendChild(div);
        });

        return; 
    }

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&lat=${lat}&lon=${lon}&radius=${radius}&countrycodes=IN&limit=5`)
        .then(response => response.json())
        .then(data => {
            const suggestions = type === 'start' ? document.getElementById('start-suggestions') : document.getElementById('destination-suggestions');
            suggestions.innerHTML = '';

            data.forEach(item => {
                const div = document.createElement('div');
                div.textContent = item.display_name;
                div.onclick = () => {
                    if (type === 'start') {
                        document.getElementById('start').value = item.display_name;
                        startPoint = [item.lat, item.lon];
                        updateMarker('start');
                    } else {
                        document.getElementById('destination').value = item.display_name;
                        endPoint = [item.lat, item.lon];
                        updateMarker('destination');
                    }
                    suggestions.innerHTML = '';
                    calculateRoute(); 
                    autoNavigate(); // Automatically navigate
                };
                suggestions.appendChild(div);
            });
        }).catch(error => console.error('Error fetching nearby suggestions:', error));
}

function fetchStartSuggestions() {
    const query = document.getElementById('start').value;
    if (!query) {
        document.getElementById('start-suggestions').innerHTML = '';
        removeMarker('start'); // Remove marker when input is empty
        return;
    }

    fetchNearbySuggestions(query, 'start');
}

function fetchDestinationSuggestions() {
    const query = document.getElementById('destination').value;
    if (!query) {
        document.getElementById('destination-suggestions').innerHTML = '';
        removeMarker('destination'); // Remove marker when input is empty
        return;
    }

    fetchNearbySuggestions(query, 'destination');
}

function setCurrentLocation(type) {
    if (!userLocation) {
        alert('Current location not available.');
        return;
    }

    if (type === 'start') {
        document.getElementById('start').value = 'Your Location';
        startPoint = userLocation;

        updateMarker('start');
    } else if (type === 'destination') {
        document.getElementById('destination').value = 'Your Location';
        endPoint = userLocation;
        updateMarker('destination');
    }

    calculateRoute(); // Automatically calculate the route
}

function updateMarker(type) {
    if (type === 'start') {
        if (startMarker) {
            map.removeLayer(startMarker);
        }
        startMarker = L.marker(startPoint).addTo(map)
            .bindPopup('Starting Point')
            .openPopup();
    } else if (type === 'destination') {
        if (endMarker) {
            map.removeLayer(endMarker);
        }
        endMarker = L.marker(endPoint).addTo(map)
            .bindPopup('Destination')
            .openPopup();
    }
}

function removeMarker(type) {
    if (type === 'start' && startMarker) {
        map.removeLayer(startMarker);
        startPoint = null;
    } else if (type === 'destination' && endMarker) {
        map.removeLayer(endMarker);
        endPoint = null;
    }
}

function calculateRoute() {
    if (!startPoint || !endPoint) {
        alert('Please select both starting point and destination.');
        return;
    }

    const start = `${startPoint[1]},${startPoint[0]}`;
    const end = `${endPoint[1]},${endPoint[0]}`;
    let url;

    if (selectedMode === 'driving') {
        url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start};${end}?access_token=${mapboxApiKey}&geometries=geojson`;
    } else if (selectedMode === 'cycling') {
        url = `https://api.openrouteservice.org/v2/directions/cycling-regular?api_key=${openRouteServiceApiKey}&start=${start}&end=${end}`;
    } else if (selectedMode === 'walking') {
        url = `https://api.mapbox.com/directions/v5/mapbox/walking/${start};${end}?access_token=${mapboxApiKey}&geometries=geojson`;
    }

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const routeCoords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                
                // Display route and time estimate
                displayRoute(routeCoords, route.duration);

                // Update directions service with the new route
                if (directions) {
                    directions.setOrigin(startPoint);
                    directions.setDestination(endPoint);
                }
                
                // Automatically navigate after route calculation
                autoNavigate();
            }
        }).catch(error => {
            console.error(`Error fetching ${selectedMode} route:`, error);
            alert(`Error fetching ${selectedMode} route.`);
        });
}

function displayRoute(routeCoords, duration) {
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }

    routeLayer = L.polyline(routeCoords, { color: getColorForMode(selectedMode) }).addTo(map);
    map.fitBounds(routeLayer.getBounds());

    const hours = Math.floor(duration / 3600);
    const minutes = Math.round((duration % 3600) / 60);

    document.getElementById('time-estimates').innerHTML = `
        <div><strong>${selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)}:</strong> 
        ${hours > 0 ? hours + ' hrs ' : ''}${minutes} min</div>
    `;
}

function getColorForMode(mode) {
    switch (mode) {
        case 'driving': return 'blue';
        case 'cycling': return 'green';
        case 'walking': return 'red';
        default: return 'black';
    }
}

function setTransportMode(mode) {
    selectedMode = mode;
    document.getElementById('selected-mode').textContent = `Selected mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
    calculateRoute(); // Automatically calculate the route when mode changes
}

function saveFavorite() {
    const name = document.getElementById('favorite-name').value.trim();
    if (!name) {
        alert('Please enter a name for the favorite location.');
        return;
    }
    if (!userLocation) {
        alert('Current location not available.');
        return;
    }

    favorites[name] = userLocation;

    const favoritesList = document.getElementById('favorites-list');
    const listItem = document.createElement('li');
    listItem.textContent = name;
    listItem.onclick = () => {
        document.getElementById('start').value = name;
        startPoint = favorites[name];
        updateMarker('start');
        calculateRoute(); // Automatically calculate the route
    };
    favoritesList.appendChild(listItem);

    document.getElementById('favorite-name').value = '';
}

let startAddress = '';
let destinationAddress = '';

function navigate() {
    if (!startPoint || !endPoint) {
        alert('Please select both starting point and destination.');
        return;
    }

    // Convert coordinates to a readable address
    
    fetchAddress(startPoint).then(startAddr => {
        if (startPoint === userLocation) {
            startAddress = 'Your Location';
        }else{
        startAddress = startAddr;}
        console.log('Start Address:', startAddress);
        console.log('user address', userLocation);

        fetchAddress(endPoint).then(destAddr => {
            destinationAddress = destAddr;
            console.log('Destination Address:', destinationAddress);

            // Proceed with navigation
            const mapsUrl = "https://www.google.com/maps/dir/?api=1";
            const originEncoded = encodeURIComponent(startAddress);
            const destinationEncoded = encodeURIComponent(destinationAddress);

            let mapsUrlComplete = `${mapsUrl}&origin=${originEncoded}&destination=${destinationEncoded}&travelmode=${selectedMode}`;

            // Try to open the Google Maps app directly
            const appUrl = `google.navigation:q=${destinationAddress}&mode=w`;

            if (navigator.userAgent.match(/Android/i)) {
                // For Android devices
                window.location.href = appUrl;
            } else if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
                // For iOS devices
                window.location.href = appUrl;
            } else {
                // For other devices, open in a new tab
                window.open(mapsUrlComplete, '_blank');
            }
        }).catch(error => {
            console.error('Error fetching destination address:', error);
        });
    }).catch(error => {
        console.error('Error fetching start address:', error);
    });
}

function fetchAddress(coords) {
    const [lat, lon] = coords;
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;

    return fetch(url)
        .then(response => response.json())
        .then(data => {
            return data.display_name;
        })
        .catch(error => {
            console.error('Error fetching address:', error);
            return '';
        });
}

function startNavigation() {
    navigate();
}

function autoNavigate() {
    if (startPoint && endPoint) {
        navigate();
    }
}

window.onload = initMap;
