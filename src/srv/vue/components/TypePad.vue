<script setup lang="ts">
import {ref} from 'vue';
import type {I_DocumentType, I_StructureEntry} from "../../../types.ts";
import TypeCreationDialog from './TypeCreationDialog.vue';
import type DbPouchClient from 'docpouch-client';

const props = defineProps<{
  typeList: I_DocumentType[];
  structureList: I_StructureEntry[];
  apiClient: DbPouchClient;
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  'typeSelectedID': [type: string];
  'typeListChanged': [];
}>();

// Filter states
const typeFilter = ref('');
const hasActiveFilters = ref(false);

const showDeleteConfirmDialog = ref(false);
const showCreationDialog = ref(false);
const selectedTypeID = ref<string | null>(null);

const confirmDelete = () => {
  if (selectedTypeID.value) {
    showDeleteConfirmDialog.value = true;
  }
};

const cancelDelete = () => {
  showDeleteConfirmDialog.value = false;
  selectedTypeID.value = null;
};

const cancelCreation = () => {
  showCreationDialog.value = false;
};

const handleTypeDeleted = async () => {
  if (selectedTypeID.value && props.apiClient) {
    try {
      await props.apiClient.removeType(selectedTypeID.value);
      emit('typeListChanged');
      showDeleteConfirmDialog.value = false;
      selectedTypeID.value = null;
    } catch (error) {
      console.error("Error deleting document type:", error);
    }
  }
};

const selectType = (id: string) => {
  emit('typeSelectedID', id);
  selectedTypeID.value = id;
};

function handleTypeCreated(newType: I_DocumentType) {
  try {
    props.apiClient.createType(newType).then(res => {
      emit('typeListChanged');
      showCreationDialog.value = false;
      if (res._id)
        selectedTypeID.value = res._id;
    });
  } catch (e) {
    console.error("Error creating document type:", e);
  }
}

</script>

<template>
  <v-card>
    <v-card-text>
      <!-- Filters -->
      <v-row>
        <v-col cols="12">
          <v-text-field v-model="typeFilter" label="Type Filter"/>
        </v-col>
      </v-row>

      <!-- Type List -->
      <div class="user-list-wrapper">
        <v-list class="user-list bg-grey-lighten-4" density="compact">
          <v-list-item
              v-for="type in props.typeList"
              :key="type._id"
              :active="selectedTypeID !== null && selectedTypeID === type._id"
              @click="selectType(type._id!)"
              class="user-list-item"
          >
            <template v-slot:prepend>
              <v-avatar color="primary" size="32">
                <v-icon icon="mdi-format-list-bulleted-type"></v-icon>
              </v-avatar>
            </template>
            <v-list-item-title>{{ type.name }}</v-list-item-title>
            <v-list-item-subtitle>
              <div class="d-flex flex-row">
                <span class="mr-3">
                  <v-icon icon="format-list-bulleted-type" size="small" class="mr-1"></v-icon>
                  Type: {{ type.type }}
                </span>
                <span>
                  <v-icon icon="file-tree" size="small" class="mr-1"></v-icon>
                  Subtype: {{ type.subType }}
                </span>
              </div>
            </v-list-item-subtitle>
          </v-list-item>

          <!-- Empty state when no users match filters -->
          <v-list-item v-if="props.typeList?.length === 0 && hasActiveFilters">
            <v-list-item-title class="text-center text-grey">
              No types match the current filters
            </v-list-item-title>
          </v-list-item>

          <!-- Empty state when no users exist -->
          <v-list-item v-if="props.typeList?.length === 0 && !hasActiveFilters">
            <v-list-item-title class="text-center text-grey">
              No types available. Click "New" to create the first document type.
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </div>
      <div v-if="props.isAdmin" class="d-flex justify-end mt-3">
        <v-btn color="primary" class="mr-2" prepend-icon="mdi-plus" @click="showCreationDialog = true">New</v-btn>
        <v-btn color="error" prepend-icon="mdi-delete" @click="confirmDelete" :disabled="!selectedTypeID">Remove</v-btn>
      </div>

      <!-- Creation Dialog -->
      <TypeCreationDialog
          v-if="showCreationDialog"
          :show="showCreationDialog"
          :type-list="props.typeList"
          :structure-list="props.structureList"
          @typeCreated="handleTypeCreated"
          @cancel-dialog="cancelCreation"
      />


      <!-- Delete Confirmation Dialog -->
      <v-dialog v-model="showDeleteConfirmDialog" max-width="500px">
        <v-card>
          <v-card-title>Confirm Deletion</v-card-title>
          <v-card-text>Are you sure you want to delete this document type?</v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn color="error" @click="handleTypeDeleted">Delete</v-btn>
            <v-btn @click="cancelDelete">Cancel</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-card-text>
  </v-card>
</template>

<style scoped>
/* Add your custom styles here */
</style>