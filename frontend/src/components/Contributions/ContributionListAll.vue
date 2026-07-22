<template>
  <div class="contribution-filter d-flex flex-wrap gap-2 mb-3">
    <BFormInput
      v-model="searchInput"
      class="contribution-filter-search"
      :placeholder="$t('contribution.filter.searchAll')"
    />
    <BFormSelect
      v-model="selectedGroup"
      class="contribution-filter-group"
      :options="groupOptions"
    />
  </div>
  <div v-if="items.length === 0 && !loading">
    <div v-if="isFiltered">
      {{ $t('contribution.filter.noResults') }}
    </div>
    <div v-else-if="currentPage === 1">
      {{ $t('contribution.noContributions.allContributions') }}
    </div>
    <div v-else>
      {{ $t('contribution.noContributions.emptyPage') }}
    </div>
  </div>
  <div v-else class="contribution-list-all">
    <div v-for="item in items" :key="item.id + 'a'" class="mb-3">
      <div :id="`contributionListItem-${item.id}`">
        <contribution-list-all-item v-bind="item" />
      </div>
    </div>
  </div>
  <paginator-route-params-page
    v-model="currentPage"
    :total-count="contributionCount"
    :loading="loading"
    :page-size="pageSize"
  />
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import ContributionListAllItem from '@/components/Contributions/ContributionListAllItem.vue'
import { listAllContributions, groupTags as groupTagsQuery } from '@/graphql/contributions.graphql'
import { useQuery } from '@vue/apollo-composable'
import CONFIG from '@/config'
import PaginatorRouteParamsPage from '@/components/PaginatorRouteParamsPage.vue'
import { PAGE_SIZE } from '@/constants'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const route = useRoute()
const { t } = useI18n()

// constants
const pollInterval = CONFIG.AUTO_POLL_INTERVAL || undefined
const pageSize = PAGE_SIZE

// computed
const currentPage = ref(Number(route.params.page) || 1)

// Group functions: search by text or by the submitter's name, plus a group filter. The
// typed text is debounced so a query does not go out on every keystroke; any change returns
// to the first page, otherwise one could end up on an empty page of a smaller result.
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
  { value: null, text: t('contribution.filter.allGroups') },
  // Reserved token, matched by the backend against the contributions that belong to no
  // group at all. A real slug can never be '*…', so it cannot collide.
  { value: '*untagged', text: t('contribution.filter.noGroup') },
  ...(groupTagsResult.value?.groupTags ?? []).map((group) => ({
    value: group.tag,
    text: group.name ? `${group.name} (#${group.tag})` : `#${group.tag}`,
  })),
])

const { result, loading } = useQuery(
  listAllContributions,
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

const contributionCount = computed(() => {
  return result.value?.listAllContributions.contributionCount || 0
})
const items = computed(() => {
  return [...(result.value?.listAllContributions.contributionList || [])]
})
</script>
