<template>
  <div>
    <coordinates-display
      v-if="map && showCoordinates"
      :community-position="communityPosition"
      :user-position="userPosition"
      @centerMap="handleMapCenter"
    />
    <div ref="mapContainer" class="map-container" :style="{ height }" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import L from 'leaflet'
// Own the Leaflet base stylesheet here so the map renders correctly wherever it
// is embedded (the settings page imported it in a wrapper; the matching page
// embeds this component directly, where the missing CSS left the tiles static
// and scattered).
import 'leaflet/dist/leaflet.css'
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch'
import 'leaflet-geosearch/dist/geosearch.css'
import CoordinatesDisplay from '@/components/UserSettings/CoordinatesDisplay.vue'
import { useI18n } from 'vue-i18n'

const mapContainer = ref(null)
const map = ref(null)
const userMarker = ref(null)
const communityMarker = ref(null)
const userPosition = ref({ lat: 0, lng: 0 })
const communityPosition = ref({ lat: 0, lng: 0 })
const defaultZoom = 13

const emit = defineEmits(['update:userPosition'])

const props = defineProps({
  userMarkerCoords: Object,
  communityMarkerCoords: Object,
  // optional map height; default keeps the settings-page usage unchanged
  height: { type: String, default: '400px' },
  // the settings page shows the coordinates readout; the matching tab hides it
  showCoordinates: { type: Boolean, default: true },
  // 'pin' (default, the settings page) or 'crown' — the matching tab shows the
  // same gold crown as the big map, so "you" reads the same everywhere.
  userIcon: { type: String, default: 'pin' },
  // label carried on the crown itself (e.g. "Du"); when empty the marker keeps
  // its popup with the settings label.
  userLabel: { type: String, default: '' },
})

const { t } = useI18n()

onMounted(async () => {
  if (props.userMarkerCoords) {
    userPosition.value = props.userMarkerCoords
  }
  if (props.communityMarkerCoords) {
    communityPosition.value = props.communityMarkerCoords
  }
  setTimeout(() => initMap(), 250)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (map.value) {
    map.value.remove()
  }
  window.removeEventListener('resize', handleResize)
})

function initMap() {
  if (mapContainer.value && !map.value) {
    map.value = L.map(mapContainer.value, {
      center: [userPosition.value.lat, userPosition.value.lng],
      zoom: defaultZoom,
      zoomControl: false,
      closePopupOnClick: false,
    })

    L.control.zoom({ position: 'topleft' }).addTo(map.value)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map.value)

    // User marker (movable). The matching tab asks for the crown — the same
    // "you" as the big map; the settings page keeps the classic pin.
    const crown = props.userIcon === 'crown'
    const userIconDef = crown
      ? L.divIcon({
          className: 'own-crown',
          html: `<div style="position:relative;width:34px;">
              <svg viewBox="0 0 32 26" width="34" height="27" style="display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))" aria-hidden="true">
                <polygon points="1,25 1,7 9,13 16,1 23,13 31,7 31,25" fill="#c69130" stroke="#3a2600" stroke-width="1.4" stroke-linejoin="round"/>
                <rect x="1" y="22" width="30" height="3" fill="#3a2600"/>
              </svg>${
                props.userLabel
                  ? `<span style="position:absolute;left:40px;top:2px;font-size:13px;font-weight:700;white-space:nowrap;color:#8a6407;text-shadow:0 0 3px #fff,0 0 3px #fff">${props.userLabel}</span>`
                  : ''
              }</div>`,
          iconSize: [34, 40],
          iconAnchor: [17, 34],
        })
      : L.icon({
          iconUrl:
            'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
          shadowUrl:
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        })

    userMarker.value = L.marker([userPosition.value.lat, userPosition.value.lng], {
      draggable: true,
      interactive: false,
      icon: userIconDef,
    }).addTo(map.value)

    // The crown carries its own label; the pin explains itself with a popup.
    if (!crown) {
      userMarker.value
        .bindPopup(t('settings.GMS.map.userLocationLabel'), {
          autoClose: false,
          closeOnClick: false,
          closeButton: false,
        })
        .openPopup()
    }

    // Community marker (fixed)
    communityMarker.value = L.marker([communityPosition.value.lat, communityPosition.value.lng], {
      draggable: false,
      interactive: false,
      icon: L.icon({
        iconUrl:
          'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    }).addTo(map.value)

    communityMarker.value
      .bindPopup(t('settings.GMS.map.communityLocationLabel'), {
        autoClose: false,
        closeOnClick: false,
        closeButton: false,
      })
      .openPopup()

    map.value.on('click', onMapClick)
    userMarker.value.on('dragend', onMarkerDragEnd)

    // GeoSearch control
    const provider = new OpenStreetMapProvider()
    const searchControl = new GeoSearchControl({
      provider,
      style: 'button',
      showMarker: false,
      showPopup: false,
      autoClose: true,
      retainZoomLevel: false,
      animateZoom: true,
      keepResult: false,
      searchLabel: t('settings.GMS.map.search'),
    })
    map.value.addControl(searchControl)

    map.value.on('geosearch/showlocation', (result) => {
      const { x, y, label } = result.location
      updateUserPosition({ lat: y, lng: x })
    })

    // Center map on user position
    centerMapOnUser()
  }
}

function handleResize() {
  if (map.value) {
    map.value.invalidateSize()
    centerMapOnUser()
  }
}

function onMapClick(e) {
  updateUserPosition(e.latlng)
}

function onMarkerDragEnd() {
  if (userMarker.value) {
    updateUserPosition(userMarker.value.getLatLng())
  }
}

function updateUserPosition(latlng) {
  userPosition.value = { lat: latlng.lat, lng: latlng.lng }
  if (userMarker.value) {
    userMarker.value.setLatLng(latlng)
    userMarker.value.openPopup()
  }
  centerMapOnUser()
  emit('update:userPosition', userPosition.value)
}

function centerMapOnUser() {
  if (map.value && userPosition.value) {
    map.value.setView([userPosition.value.lat, userPosition.value.lng], map.value.getZoom(), {
      animate: true,
      pan: {
        duration: 0.5,
      },
    })
  }
}

function centerMapOnCommunity() {
  if (map.value && communityPosition.value) {
    map.value.setView(
      [communityPosition.value.lat, communityPosition.value.lng],
      map.value.getZoom(),
      {
        animate: true,
        pan: {
          duration: 0.5,
        },
      },
    )
  }
}

function handleMapCenter(centerMode) {
  if (centerMode === 'USER') centerMapOnUser()
  else centerMapOnCommunity()
}

watch(userPosition, (newPosition) => {
  emit('update:userPosition', newPosition)
})
</script>

<style scoped>
.map-container {
  height: 400px;
  width: 100%;
}

/* Leaflet paints div-icons on a white bordered box by default; the crown rides
   transparent, the way the big map's own-marker does. */
:deep(.own-crown) {
  background: transparent;
  border: 0;
}

.leaflet-control-custom a {
  background-color: #fff;
  width: 30px;
  height: 30px;
  line-height: 30px;
  text-align: center;
  text-decoration: none;
  color: black;
}

.leaflet-control-custom a:hover {
  background-color: #f4f4f4;
}

:deep(.leaflet-control-zoom > a) {
  color: #555 !important;
}
</style>
