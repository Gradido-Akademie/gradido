<template>
  <div id="component-sidebar">
    <div
      id="side-menu"
      ref="sideMenu"
      class="gradido-border-radius pt-2 bg-white"
      :class="shadow ? 'app-box-shadow' : ''"
    >
      <div class="mb-3 mt-3">
        <BNav vertical class="w-200">
          <BNavItem to="/overview" class="mb-3" active-class="active-route">
            <div class="sidebar-menu-item-wrapper">
              <i-fa-home class="svg-icon" />
              <span class="ms-2">{{ $t('navigation.overview') }}</span>
            </div>
          </BNavItem>
          <BNavItem to="/send" class="mb-3" active-class="active-route">
            <div class="sidebar-menu-item-wrapper">
              <IBiSend class="svg-icon" />
              <span class="ms-2">{{ $t('navigation.send') }}</span>
            </div>
          </BNavItem>
          <BNavItem to="/transactions" :class="transactionClass" active-class="active-route">
            <div class="sidebar-menu-item-wrapper">
              <i-ion-layers-sharp class="svg-icon" />
              <span class="ms-2">{{ $t('navigation.transactions') }}</span>
            </div>
          </BNavItem>
          <BNavItem
            ref="contributionsLink"
            to="/contributions"
            class="mb-3"
            active-class="active-route"
          >
            <div class="sidebar-menu-item-wrapper">
              <i-mdi-people-group class="svg-icon" />
              <span class="ms-2">{{ $t('creation') }}</span>
            </div>
          </BNavItem>
          <BNavItem to="/matching" class="mb-3" active-class="active-route">
            <div class="sidebar-menu-item-wrapper">
              <i-tabler-heart-handshake class="svg-icon" />
              <span class="ms-2">Matching</span>
            </div>
          </BNavItem>
        </BNav>
        <hr class="m-3" />
        <BNav vertical class="w-100">
          <BNavItem to="/information" class="mb-3" active-class="active-route">
            <div class="sidebar-menu-item-wrapper">
              <i-mdi-information class="svg-icon" />
              <span class="ms-2">{{ $t('info') }}</span>
            </div>
          </BNavItem>
          <BNavItem
            to="/settings"
            class="mb-3 d-block"
            active-class="active-route"
            data-test="settings-menu"
          >
            <div class="sidebar-menu-item-wrapper">
              <div>
                <i-mdi-settings class="svg-icon" />
                <span class="ms-2">{{ $t('navigation.settings') }}</span>
              </div>
              <BBadge v-if="!$store.state.username" variant="warning">
                {{ $t('settings.newSettings') }}
              </BBadge>
            </div>
          </BNavItem>
          <BNavItem
            v-if="$store.state.roles && $store.state.roles.length > 0"
            class="mb-3 text-light"
            active-class="active-route"
            @click="$emit('admin')"
          >
            <div class="sidebar-menu-item-wrapper">
              <IBiShieldCheck />
              <span class="ms-2">
                {{ $t('navigation.admin_area') }}
              </span>
            </div>
          </BNavItem>
          <BNavItem
            class="fw-bold"
            active-class="active-route"
            data-test="logout-menu"
            @click="$emit('logout')"
          >
            <div class="sidebar-menu-item-wrapper">
              <i-humbleicons-logout class="svg-icon logout-icon" />
              <span class="ms-2 logout-text">{{ $t('navigation.logout') }}</span>
            </div>
          </BNavItem>
        </BNav>
      </div>
    </div>

    <!-- The logo lives in the navbar. A route that hides the navbar would take
         the logo down with it, so the menu takes it in — below the items, where
         it does not compete with the first thing you read. -->
    <router-link v-if="showLogo" to="/overview" class="sidebar-logo d-none d-lg-block">
      <BImg :src="logo" width="160" alt="Logo" />
    </router-link>
  </div>
</template>
<script setup>
import { useRoute } from 'vue-router'
import { ref, watch, computed } from 'vue'

const props = defineProps({
  shadow: { type: Boolean, default: true },
  // Set by routes that hide the navbar — see DashboardLayout's bareChrome.
  showLogo: { type: Boolean, default: false },
})

// Same asset the navbar uses, at 80 % of its width: down here it is a mark, not
// a masthead.
const logo = '/img/brand/gradido-logo.png'

const emit = defineEmits(['closeSidebar'])

const route = useRoute()
const contributionsLink = ref(null)

const transactionClass = computed(() => {
  if (route.path === '/gdt') {
    return 'mb-3 active-route'
  }
  return 'mb-3'
})

watch(
  () => route.path,
  () => {
    const link = [...contributionsLink.value.$el.children][0]
    if (route.path.includes('contributions')) {
      link.classList.add('active-route')
      link.classList.add('router-link-exact-active')
    } else {
      link.classList.remove('active-route')
      link.classList.remove('router-link-exact-active')
    }
    emit('closeSidebar')
  },
)
</script>
<style scoped>
.sidebar-logo {
  display: block;
  margin-top: 1.5rem;
  padding-left: 0.5rem;
}

:deep(.nav-item > a) {
  color: rgb(56 56 56) !important;
  border-left: 4px transparent solid;
  display: block;
}

:deep(.active-route) {
  display: block;
  font-weight: bold;
  color: rgb(2 2 1);
  border-left-color: rgb(219 129 19) !important;
}

:deep(.nav-link) {
  padding: 0;
}

.logout-text,
.logout-icon {
  color: #cd5556;
}

.sidebar-menu-item-wrapper {
  padding: 4px 12px;
}

.svg-icon {
  filter: brightness(1) invert(0);
}

.active-route .svg-icon {
  filter: brightness(0) invert(0);
}

#component-sidebar {
  min-width: 200px;
}

@media screen and (width >= 1025px) {
  #side-menu {
    max-width: 180px;
  }

  #component-sidebar {
    min-width: 180px;
  }
}

/*
@media screen and (min-width: 1075px) {
  #side-menu {
    max-width: 200px;
  }
  #component-sidebar {
    min-width: 200px;
  }
}
@media screen and (max-width: 1108px) {
  #side-menu {
    max-width: 100%;
  }
  #component-sidebar {
    max-width: 100%;
  }
} */
</style>
