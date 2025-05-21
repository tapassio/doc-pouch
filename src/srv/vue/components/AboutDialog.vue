<script setup lang="ts">
const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  'close': [value: boolean];
}>();

function handleOK() {
    emit("close", true);
}

</script>

<template>
  <v-dialog v-model="props.show" persistent max-width="400px">
    <v-card>
      <v-card-title class="text-h5">docPouch V0.8.1</v-card-title>
      <v-card-text>
        [Insert short description, authorship information and link to Github Repository]
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="elevated" @click="handleOK">OK</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
