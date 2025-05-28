<script setup lang="ts">
import packageJson from '../../../../package.json';

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
      <v-card-title class="text-h5">docPouch V{{packageJson.version}}</v-card-title>
      <v-card-text>
        [Insert short description, authorship information and link to Github Repository]
        Client Version: {{packageJson.dependencies['docpouch-client']}}
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="elevated" @click="handleOK">OK</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
