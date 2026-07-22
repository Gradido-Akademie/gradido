<template>
  <div class="contribution-filter d-flex flex-wrap gap-2 mb-3">
    <BFormInput
      v-model="searchInput"
      class="contribution-filter-search"
      :placeholder="t('contribution.filter.searchOwn')"
    />
    <BFormSelect
      v-model="selectedGroup"
      class="contribution-filter-group"
      :options="groupOptions"
    />
  </div>
  <div v-if="items.length === 0 && !loading">
    <div v-if="isFiltered">
      {{ t('contribution.filter.noResults') }}
    </div>
    <div v-else-if="currentPage === 1">
      {{ t('contribution.noContributions.myContributions') }}
    </div>
    <div v-else>
      {{ t('contribution.noContributions.emptyPage') }}
    </div>
  </div>
  <div v-else class="contribution-list">
    <div v-for="item in items" :key="item.id + 'a'" class="mb-3">
      <div :id="`contributionListItem-${item.id}`">
        <contribution-list-item
          v-bind="item"
          :contribution-id="item.id"
          :messages-visible="openMessagesListId === item.id"
          @toggle-messages-visible="toggleMessagesVisible(item.id)"
          @update-contribution-form="updateContributionForm"
          @contribution-changed="refetch()"
        />
      </div>
    </div>
  </div>
  <paginator-route-params-page
    v-model="currentPage"
    :page-size="pageSize"
    :total-count="contributionCount"
    :loading="loading"
  />
</template>
<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import ContributionListItem from '@/components/Contributions/ContributionListItem.vue'
import { listContributions, groupTags as groupTagsQuery } from '@/graphql/contributions.graphql'
import { useQuery } from '@vue/apollo-composable'
import { PAGE_SIZE } from '@/constants'
import { useI18n } from 'vue-i18n'
import CONFIG from '@/config'
import { useRoute } from 'vue-router'
import PaginatorRouteParamsPage from '@/components/PaginatorRouteParamsPage.vue'

const route = useRoute()

// composables
const { t } = useI18n()

// constants
const pageSize = PAGE_SIZE
const pollInterval = CONFIG.AUTO_POLL_INTERVAL || undefined

// events
const emit = defineEmits(['update-contribution-form'])

// refs
const currentPage = ref(Number(route.params.page) || 1)
const openMessagesListId = ref(null)

// Group functions: search by text and filter by group. The typed text is debounced so a
// query does not go out on every keystroke; any change returns to the first page, otherwise
// one could end up on an empty page of a smaller result.
const searchInput = ref('')
const searchText = ref('')
const selectedGroup = ref(null)
let searchTimer = null

watch(searchInput, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchText.value = value
    currentPage.value = 1
  }, 400)
})
watch(selectedGroup, () => {
  currentPage.value = 1
})

const isFiltered = computed(() => Boolean(searchText.value || selectedGroup.value))

const { result: groupTagsResult } = useQuery(groupTagsQuery)
const groupOptions = computed(() => [
  // Same three answers as the community tab: everything, everything that belongs to some
  // group, everything that belongs to none. The last two are reserved tokens the backend
  // matches; a real slug can never be '*…', so they cannot collide.
  { value: null, text: t('contribution.filter.all') },
  { value: '*grouped', text: t('contribution.filter.grouped') },
  { value: '*untagged', text: t('contribution.filter.noGroup') },
  ...(groupTagsResult.value?.groupTags ?? []).map((group) => ({
    value: group.tag,
    text: group.name ? `${group.name} (#${group.tag})` : `#${group.tag}`,
  })),
])

// queries
const { result, loading, refetch, onResult } = useQuery(
  listContributions,
  () => ({
    pagination: {
      currentPage: currentPage.value,
      pageSize,
      order: 'DESC',
    },
    filter: {
      query: searchText.value || null,
      groupTag: selectedGroup.value,
    },
  }),
  {
    fetchPolicy: 'cache-and-network',
    pollInterval,
  },
)

// computed
const contributionCount = computed(() => {
  return result.value?.listContributions.contributionCount || 0
})
const items = computed(() => {
  return [...(result.value?.listContributions.contributionList || [])]
})

// callbacks
// scroll to anchor, if hash ist present in url and after data where loaded
onResult(({ _data }) => {
  nextTick(() => {
    if (!route.hash) {
      return
    }
    const el = document.querySelector(route.hash)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
})

// methods
const toggleMessagesVisible = (contributionId) => {
  if (openMessagesListId.value === contributionId) {
    openMessagesListId.value = 0
  } else {
    openMessagesListId.value = contributionId
  }
}
const updateContributionForm = (item) => {
  emit('update-contribution-form', { item, page: currentPage.value })
}
</script>
