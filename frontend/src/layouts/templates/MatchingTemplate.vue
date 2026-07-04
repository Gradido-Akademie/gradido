<template>
  <contribution-info>
    <template #entries>
      <div class="text-dark">
        <h4 class="alert-heading">{{ $t('matching.info.entries.heading') }}</h4>
        <p>{{ $t('matching.info.entries.text') }}</p>
        <ul class="list-unstyled">
          <li class="d-flex align-items-baseline gap-2 mb-1">
            <i-bi-heart-fill style="color: #c2557e" />
            <span>
              <strong>{{ $t('matching.type.interesse.word') }}</strong>
              — {{ $t('matching.type.interesse.desc') }}
            </span>
          </li>
          <li class="d-flex align-items-baseline gap-2 mb-1">
            <i-bi-box-seam style="color: #047006" />
            <span>
              <strong>{{ $t('matching.type.angebot.word') }}</strong>
              — {{ $t('matching.type.angebot.desc') }}
            </span>
          </li>
          <li class="d-flex align-items-baseline gap-2 mb-1">
            <i-bi-search style="color: #0e79bc" />
            <span>
              <strong>{{ $t('matching.type.gesuch.word') }}</strong>
              — {{ $t('matching.type.gesuch.desc') }}
            </span>
          </li>
        </ul>
        <p>{{ $t('matching.info.entries.paused') }}</p>
      </div>
    </template>
    <template #about>
      <div class="text-dark">
        <h4 class="alert-heading">{{ $t('matching.info.about.heading') }}</h4>
        <p>{{ $t('matching.info.about.p1') }}</p>
        <p>{{ $t('matching.info.about.p2') }}</p>
      </div>
    </template>
    <template #position>
      <div class="text-dark">
        <h4 class="alert-heading">{{ $t('matching.info.position.heading') }}</h4>
        <p>{{ $t('matching.info.position.p1') }}</p>
        <p>{{ $t('matching.info.position.p2') }}</p>
      </div>
    </template>
  </contribution-info>
</template>
<script setup>
import ContributionInfo from '@/components/Template/RightSide/ContributionInfo.vue'
</script>
