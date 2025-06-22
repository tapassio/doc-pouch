<script lang="ts" setup>
import {ref} from 'vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  'close': [value: boolean];
  'logout': [];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const isUploading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

function handleCancel() {
  // Reset state
  selectedFile.value = null;
  errorMessage.value = '';
  successMessage.value = '';
  isUploading.value = false;

  // Close dialog
  emit("close", false);
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    const file = input.files[0];

    // Check if it's a zip file
    if (file.type !== 'application/zip' && !file.name.endsWith('.zip')) {
      errorMessage.value = 'Please select a valid ZIP file.';
      selectedFile.value = null;
      return;
    }

    selectedFile.value = file;
    errorMessage.value = '';
  }
}

async function handleImport() {
  if (!selectedFile.value) {
    errorMessage.value = 'Please select a file to import.';
    return;
  }

  try {
    isUploading.value = true;
    errorMessage.value = '';

    // Get the base URL
    const baseUrl = window.location.href.slice(0, Math.min(
        window.location.href.lastIndexOf('/'),
        window.location.href.indexOf(':', window.location.href.indexOf('://') + 3) !== -1
            ? window.location.href.indexOf(':', window.location.href.indexOf('://') + 3)
            : window.location.href.length
    ));

    // Create a URL for the import endpoint
    const importUrl = '/database/import';

    // Create form data
    const formData = new FormData();
    formData.append('file', selectedFile.value);

    // Get the authorization token from localStorage
    const token = localStorage.getItem('authToken');

    if (!token) {
      errorMessage.value = 'You must be logged in to import the database.';
      isUploading.value = false;
      return;
    }

    // Send the request
    const response = await fetch(importUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Import failed');
    }

    // Show success message
    successMessage.value = 'Database imported successfully. You will be logged out.';

    // Wait a moment before logging out
    setTimeout(() => {
      emit('logout');
      handleCancel();
    }, 2000);

  } catch (error: any) {
    console.error('Error importing database:', error);
    errorMessage.value = `Error importing database: ${error.message}`;
  } finally {
    isUploading.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="props.show" max-width="500px" persistent>
    <v-card>
      <v-card-title class="text-h5 bg-red-darken-2 text-white">
        Import Database
      </v-card-title>
      <v-card-text class="pt-4">
        <v-alert class="mb-4" type="warning" variant="tonal">
          <strong>Warning:</strong> Importing a database will overwrite all current data. This action cannot be undone.
          Make sure you have a backup of your current data if needed.
        </v-alert>

        <div v-if="!successMessage">
          <v-file-input
              v-model="selectedFile"
              :disabled="isUploading"
              :error-messages="errorMessage"
              accept=".zip"
              label="Select ZIP file"
              prepend-icon="mdi-database-import"
              @change="handleFileChange"
          ></v-file-input>

          <p class="text-caption mt-2">
            The ZIP file should contain only database files (*.db) exported from DocPouch.
          </p>
        </div>

        <v-alert
            v-if="successMessage"
            type="success"
            variant="tonal"
        >
          {{ successMessage }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
            :disabled="isUploading"
            color="grey-darken-1"
            variant="text"
            @click="handleCancel"
        >
          Cancel
        </v-btn>
        <v-btn
            v-if="!successMessage"
            :disabled="!selectedFile || isUploading"
            :loading="isUploading"
            color="red-darken-1"
            variant="elevated"
            @click="handleImport"
        >
          Import
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>