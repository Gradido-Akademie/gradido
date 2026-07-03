<template>
  <contribution-info>
    <template #entries>
      <div class="text-dark">
        <h4 class="alert-heading">So funktioniert Matching</h4>
        <p>
          Leg an, was Du liebst, bietest oder suchst — jeder aktive Eintrag lässt Dich in den
          passenden Suchen anderer auftauchen.
        </p>
        <ul class="list-unstyled">
          <li class="d-flex align-items-baseline gap-2 mb-1">
            <i-bi-heart-fill style="color: #c2557e" />
            <span><strong>Interesse</strong> — was Du liebst</span>
          </li>
          <li class="d-flex align-items-baseline gap-2 mb-1">
            <i-bi-box-seam style="color: #047006" />
            <span><strong>Angebot</strong> — was Du gibst</span>
          </li>
          <li class="d-flex align-items-baseline gap-2 mb-1">
            <i-bi-search style="color: #0e79bc" />
            <span><strong>Gesuch</strong> — was Du suchst</span>
          </li>
        </ul>
        <p>Pausierte Einträge bleiben gespeichert — sie erscheinen nur nicht in der Suche.</p>
      </div>
    </template>
    <template #about>
      <div class="text-dark">
        <h4 class="alert-heading">Wer Du bist</h4>
        <p>
          Ein paar warme, ehrliche Sätze über Dich schaffen Vertrauen, bevor Dich jemand
          anschreibt.
        </p>
        <p>Dieser Text erscheint in Deiner Profilkarte auf der Suchkarte.</p>
      </div>
    </template>
    <template #position>
      <div class="text-dark">
        <h4 class="alert-heading">Deine Privatsphäre</h4>
        <p>
          Du entscheidest, wie genau Du erscheinst. „Ungefähr“ zeigt Dich im Umkreis — nie
          auf der Haustür.
        </p>
        <p>
          Ohne Position bist Du nicht auf der Karte. Der Schalter nimmt Dich jederzeit wieder
          heraus.
        </p>
      </div>
    </template>
  </contribution-info>
</template>
<script setup>
import ContributionInfo from '@/components/Template/RightSide/ContributionInfo.vue'
</script>
