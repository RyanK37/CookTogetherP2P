import Pear from 'pear-interface';
import Corestore from 'corestore';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';

const store = new Corestore('./cooktogether-store');
const profileCore = await store.get({ name: 'profile-data' });
const recipeCore = await store.get({ name: 'recipes' });
const activityCore = await store.get({ name: 'activity-log', valueEncoding: 'json' });

window.currentView = 'self'; 
window.currentPeerCores = { profile: null, recipes: null, activity: null };
const activeConnections = [];

await profileCore.ready();
await profileCore.update();

await recipeCore.ready();
await recipeCore.update();

await activityCore.ready();
await activityCore.update();

const swarm = new Hyperswarm();

await swarm.join(profileCore.discoveryKey, { server: true, client: true }).flushed();
await swarm.join(recipeCore.discoveryKey, { server: true, client: true }).flushed();
await swarm.join(activityCore.discoveryKey, { server: true, client: true }).flushed();

// =========================================================================================================================
// Handle incoming connections from peers
swarm.on('connection', (socket, details) => {
  console.log('Peer connected');
  const isInitiator = details.client;
  const stream = store.replicate(isInitiator);

  socket.pipe(stream).pipe(socket);
  activeConnections.push({ socket, stream });

  socket.on('error', (err) => {
    console.warn('Socket error:', err.message);
  });

  socket.on('close', () => {
    console.log('Socket closed');
    const index = activeConnections.findIndex(conn => conn.socket === socket);
    if (index !== -1) activeConnections.splice(index, 1);
  });
});

// =========================================================================================================================
// Generate or retrieve the user's unique peer ID
let mypeerId = localStorage.getItem('authorId');
if (!mypeerId) {
  mypeerId = crypto.randomUUID();
  localStorage.setItem('authorId', mypeerId);
}
window.myPeerId = mypeerId;

// =========================================================================================================================
// Function to open and close modals
window.openModal = () => document.getElementById('profileModal').classList.remove('hidden');
window.closeModal = () => document.getElementById('profileModal').classList.add('hidden');
window.openRecipeModal = () => document.getElementById('recipeModal').classList.remove('hidden');
window.closeRecipeModal = () => document.getElementById('recipeModal').classList.add('hidden');
window.openPeerConnectModal = () => document.getElementById('peerModal').classList.remove('hidden');
window.closePeerConnectModal = () => document.getElementById('peerModal').classList.add('hidden');

// =========================================================================================================================
// Show the user's peer key in the modal
window.showMyPeerKey = () => {
  const profileKey = profileCore.key.toString('hex');
  const recipeKey = recipeCore.key.toString('hex');
  const activityKey = activityCore.key.toString('hex');
  const combinedKey = `${profileKey}:${recipeKey}:${activityKey}`;

  const display = document.getElementById('myPeerKeyDisplay');
  display.textContent = combinedKey;
  display.classList.remove('hidden');
};


// =========================================================================================================================
// Open the recipe view modal with the given data and close 
window.openRecipeView = async (data) => {
  window.currentRecipeData = data;

  document.getElementById('viewTitle').textContent = data.title;
  document.getElementById('viewTime').textContent = data.time;
  document.getElementById('viewDesc').textContent = data.description;
  document.getElementById('viewImage').src = data.image || '';

  const ingredientsList = document.getElementById('viewIngredients');
  ingredientsList.innerHTML = '';
  data.ingredients.split('\n').forEach(ingredient => {
    const li = document.createElement('li');
    li.textContent = ingredient.trim();
    ingredientsList.appendChild(li);
  });

  document.getElementById('viewInstructions').textContent = data.instructions;

  const deleteBtn = document.getElementById('deleteRecipeBtn');
  deleteBtn.classList.toggle('hidden', data.author !== window.myPeerId);

  document.getElementById('recipeViewModal').classList.remove('hidden');

  if (window.currentView === 'peer' && window.lastViewedId !== data.createdAt) {
    await window.recordActivity('view', data.createdAt);
    window.lastViewedId = data.createdAt;
  }
};

window.closeRecipeView = () => {
  document.getElementById('recipeViewModal').classList.add('hidden');
  window.currentRecipeData = null;
};

// =========================================================================================================================
// Record an activity in the activity log
window.recordActivity = async (type, timestamp) => {
  if (!['view', 'download', 'delete'].includes(type)) return;
  try {
    const core = window.currentView === 'peer' ? window.currentPeerCores.activity : activityCore;
    const buffer = Buffer.from(JSON.stringify({ type, timestamp }));
    await core.append(buffer); 
    console.log(`Recorded activity: ${type} at ${new Date(timestamp).toLocaleString()}`);
  } catch (err) {
    console.error('⚠️ Failed to record activity:', err);
  }
};

// =========================================================================================================================
// Get deleted timestamps from the activity log
window.getDeletedTimestamps = async function (core = activityCore) {
  const deleted = new Set();
  for (let i = 0; i < core.length; i++) {
    let event = await core.get(i);
    if (Buffer.isBuffer(event)) {
      try {
        event = JSON.parse(event.toString());
      } catch {
        continue;
      }
    }
    if (event.type === 'delete') deleted.add(event.timestamp);
  }
  return deleted;
};

// =========================================================================================================================
// Get statistics for views and downloads from the activity log 
window.getStats = async function (core = activityCore) {
  const stats = {};
  for (let i = 0; i < core.length; i++) {
    let event = await core.get(i);
    if (Buffer.isBuffer(event)) {
      try {
        event = JSON.parse(event.toString());
      } catch {
        continue;
      }
    }
    if (event.type === 'view' || event.type === 'download') {
      if (!stats[event.timestamp]) stats[event.timestamp] = { views: 0, downloads: 0 };
      if (event.type === 'view') stats[event.timestamp].views++;
      if (event.type === 'download') stats[event.timestamp].downloads++;
    }
  }
  return stats;
};

// =========================================================================================================================
// Connect to a peer using their profile, recipe, and activity keys
window.connectToPeer = async function () {
  const input = document.getElementById('peerKeyInput').value.trim();
  if (!input.includes(':') || input.split(':').length !== 3) {
    alert('Invalid peer key format. Expecting <profileKey>:<recipeKey>:<activityKey>');
    return;
  }

  const [profileHex, recipeHex, activityHex] = input.split(':');
  const peerProfile = store.get(Buffer.from(profileHex, 'hex'), { reload: true });
  const peerRecipes = store.get(Buffer.from(recipeHex, 'hex'), { reload: true });
  const activities = store.get(Buffer.from(activityHex, 'hex'), { reload: true, valueEncoding: 'json' });
  console.log("activities-1", activities);

  await peerProfile.ready();
  await peerRecipes.ready();
  await activities.ready();
  console.log("activities-2", activities);

  await swarm.join(peerProfile.discoveryKey, { server: true, client: true }).flushed();
  await swarm.join(peerRecipes.discoveryKey, { server: true, client: true }).flushed();
  await swarm.join(activities.discoveryKey, { server: true, client: true }).flushed();
  console.log("activities-3", activities);

  await peerProfile.update();
  await peerRecipes.update();
  await activities.update();
  console.log("activities-4" ,activities);

  for (let i = 0; i < activities.length; i++) {
    const ev = await activities.get(i);
    console.log('Activity entry:', ev);
  }

  window.currentPeerCores = {
    profile: peerProfile,
    recipes: peerRecipes,
    activity : activities
  };

  peerProfile.on('append', async () => {
    console.log('New profile data received.');
    await loadProfile(peerProfile);
  });

  peerRecipes.on('append', async () => {
    console.log('New recipe data received.');
    await loadAllRecipes(peerRecipes, activities);
  });

  activities.on('append', async () => {
    console.log('Peer activity log updated.');
    await loadAllRecipes(peerRecipes, activities);
  });

  document.body.classList.add('peer-viewing');
  window.currentView = 'peer';
  await loadProfile(peerProfile);
  await loadAllRecipes(peerRecipes, activities);
};

// =========================================================================================================================
// Exit peer view and reset to self view
window.exitPeerView = async function () {
  try {
    document.body.classList.remove('peer-viewing');
    window.currentView = 'self';
    window.activityLog = null;

    if (window.currentPeerCores.profile) {
      window.currentPeerCores.profile.removeAllListeners?.();
      await window.currentPeerCores.profile.close?.();
    }
    if (window.currentPeerCores.recipes) {
      window.currentPeerCores.recipes.removeAllListeners?.();
      await window.currentPeerCores.recipes.close?.();
    }
    if (window.currentPeerCores.activity) {
      window.currentPeerCores.activity.removeAllListeners?.();
      await window.currentPeerCores.activity.close?.();
    }

    window.currentPeerCores = { profile: null, recipes: null, activity: null };

    for (const { socket, stream } of activeConnections) {
      try {
        stream.destroy?.();
        socket.destroy?.();
      } catch (e) {
        console.warn('Failed to destroy stream/socket:', e);
      }
    }
    activeConnections.length = 0;

    await loadProfile(profileCore);
    await loadAllRecipes(recipeCore);
  } catch (err) {
    console.error('Failed to exit peer view:', err);
  }
};

// =========================================================================================================================
document.getElementById('exitPeerViewBtn')?.addEventListener('click', async () => {
  await window.exitPeerView();
});
// =========================================================================================================================
// Read a file as a Data URL (base64 encoded)
function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

await loadProfile(profileCore);
await loadAllRecipes(recipeCore);

// =========================================================================================================================
// Profile modal form submission handler
document.getElementById('profileForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const name = document.getElementById('modalName').value;
  const title = document.getElementById('modalTitle').value;
  const bio = document.getElementById('modalBio').value;

  let imageDataUrl = '';
  const imageInput = document.getElementById('imageInput');
  if (imageInput.files.length > 0) {
    imageDataUrl = await readFileAsDataURL(imageInput.files[0]);
  }

  const profile = { name, title, bio, imageDataUrl, author: window.myPeerId };
  const encoded = new TextEncoder().encode(JSON.stringify(profile));
  await profileCore.append(encoded);

  updateProfileUI(profile);
  closeModal();
});

// =========================================================================================================================
// Load the profile data from the core and update the UI
async function loadProfile(core) {
  const length = await core.length;
  if (length === 0) {
    updateProfileUI(null);
    return;
  }
  const block = await core.get(length - 1);
  const profile = JSON.parse(new TextDecoder().decode(block));
  updateProfileUI(profile);
}

// =========================================================================================================================
// Update the profile UI based on the loaded profile data
function updateProfileUI(profile) {
  const isPeer = window.currentView === 'peer';

  if (!profile) {
    document.getElementById('profileName').textContent = isPeer ? '[No Profile]' : '[Your Name]';
    document.getElementById('profileTitle').textContent = isPeer ? '' : '[Your Title or Role]';
    document.getElementById('profileBio').textContent = isPeer
      ? 'This peer has not created a profile yet.'
      : 'A short description about you and your cooking style.';

    document.getElementById('profileImage').src = '';

    document.querySelector('[aria-label="Edit Profile"]').classList.toggle('hidden', isPeer);
    document.querySelectorAll('.author-only').forEach(btn => btn.classList.toggle('hidden', isPeer));
    return;
  }

  document.getElementById('profileName').textContent = profile.name || '[Your Name]';
  document.getElementById('profileTitle').textContent = profile.title || '[Your Title or Role]';
  document.getElementById('profileBio').textContent = profile.bio || 'A short description about you and your cooking style.';

  if (profile.imageDataUrl) {
    document.getElementById('profileImage').src = profile.imageDataUrl;
  } else {
    document.getElementById('profileImage').src = '';
  }

  const isAuthor = profile.author === window.myPeerId;
  document.querySelector('[aria-label="Edit Profile"]').classList.toggle('hidden', !isAuthor);
  document.querySelectorAll('.author-only').forEach(btn => btn.classList.toggle('hidden', !isAuthor));
}


document.getElementById('recipeForm').addEventListener('submit', saveRecipe);

// =========================================================================================================================
// =========================================================================================================================
// Recipe saving, loading, delete and download functions
// Recipe saving function
async function saveRecipe(e) {
  e.preventDefault();

  const title = document.getElementById('recipeTitle').value;
  const time = document.getElementById('recipeTime').value;
  const description = document.getElementById('recipeDesc').value;
  const ingredients = document.getElementById('recipeIngredients').value;
  const instructions = document.getElementById('recipeInstructions').value;
  const category = document.getElementById('recipeCategory').value;
  const imageFile = document.getElementById('recipeImage').files[0];

  let image = '';
  if (imageFile) {
    image = await readFileAsDataURL(imageFile);
  }

  const recipeData = {
    title,
    time,
    description,
    ingredients,
    instructions,
    category,
    image,
    createdAt: Date.now(),
    author: window.myPeerId
  };

  await recipeCore.append(JSON.stringify(recipeData));
  await recipeCore.update();
  await loadAllRecipes(recipeCore);
  window.closeRecipeModal();
}

// =========================================================================================================================
// Load all recipes from the core and display them in the grid
async function loadAllRecipes(core,  activity = null) {
  const container = document.getElementById('recipesGrid');
  container.innerHTML = '';

  const deleted = await window.getDeletedTimestamps(activity || activityCore);
  const stats = await window.getStats(activity || activityCore);

  const length = await core.length;
  let mostViews = -1;
  let mostDownloads = -1;
  let mostViewed = null;
  let mostDownloaded = null;

  for (let i = 0; i < length; i++) {
    const block = await core.get(i);
    const data = JSON.parse(block.toString());
    if (!data || deleted.has(data.createdAt)) continue;

    const views = stats[data.createdAt]?.views || 0;
    const downloads = stats[data.createdAt]?.downloads || 0;

    if (views > mostViews) {
      mostViews = views;
      mostViewed = { ...data, views, downloads };
    }
    if (downloads > mostDownloads) {
      mostDownloads = downloads;
      mostDownloaded = { ...data, views, downloads };
    }

    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition';
    card.addEventListener('click', () => window.openRecipeView(data));

    card.innerHTML = `
      <div class="relative h-40 bg-gray-100 flex items-center justify-center">
        ${data.image ? `<img src="${data.image}" alt="${data.title}" class="w-full h-full object-cover" />`
        : `<div class="text-gray-400 flex flex-col items-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h4l3.29-3.29a1 1 0 011.42 0L15 7h4a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z" />
              </svg>
              <span class="text-sm">No image</span>
            </div>`}
        <span class="absolute top-2 right-2 bg-white text-xs px-2 py-1 rounded-full shadow">${data.time || 'N/A'}</span>
      </div>
      <div class="p-4">
        <h4 class="font-semibold text-gray-900">${data.title}</h4>
        <p class="text-sm text-gray-500">${data.description}</p>
        <p class="text-xs text-gray-400 mt-1">Views: ${views} | Downloads: ${downloads}</p>
      </div>
    `;

    container.appendChild(card);
  }

  if (container.children.length === 0) {
    container.innerHTML = '<p class="text-gray-400 col-span-full text-center">No recipes yet. Add one!</p>';
  }

  window.mostViewedRecipe = mostViewed;
  window.mostDownloadedRecipe = mostDownloaded;
  console.log('Most viewed recipe:', mostViewed);
  console.log('Most downloaded recipe:', mostDownloaded);
};

// =========================================================================================================================
// Delete the current recipe and update the UI
window.deleteCurrentRecipe = async () => {
  if (!window.currentRecipeData) return;
  if (!confirm('Are you sure you want to delete this recipe?')) return;

  await window.recordActivity('delete', window.currentRecipeData.createdAt);
  window.closeRecipeView();

  const isPeer = window.currentView === 'peer';
  const core = isPeer ? window.currentPeerCores.recipes : recipeCore;
  const activity = isPeer ? window.currentPeerCores.activity : activityCore;

  await loadAllRecipes(core,  activity);
};

// =========================================================================================================================
// Download the current recipe as a text file
window.downloadCurrentRecipe = async () => {
  const recipe = window.currentRecipeData;
  if (!recipe) return;

  const text = `
    Title: ${recipe.title}
    Time: ${recipe.time}
    Category: ${recipe.category}
    Author: ${recipe.author}

    Description:
    ${recipe.description}

    Ingredients:
    ${recipe.ingredients}

    Instructions:
    ${recipe.instructions}
  `;

  const blob = new Blob([text.trim()], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${recipe.title || 'recipe'}.txt`;
  a.click();

  URL.revokeObjectURL(url);

  if (window.currentView === 'peer') {
    await window.recordActivity('download', recipe.createdAt);
  }
};

// =========================================================================================================================
// =========================================================================================================================
// Load the user's profile and all recipes on initial load
window.loadMyProfileAndRecipes = async () => {
  await loadProfile(profileCore);
  await loadAllRecipes(recipeCore);
};

// =========================================================================================================================
// =========================================================================================================================

const observer = new MutationObserver(() => {
  const exitBtn = document.getElementById('exitPeerViewBtn');
  const deleteBtn = document.getElementById('deleteRecipeBtn');
  if (!exitBtn) return;

  if (document.body.classList.contains('peer-viewing')) {
    exitBtn.classList.remove('hidden');
    deleteBtn.classList.add('hidden');
  } else {
    exitBtn.classList.add('hidden');
    deleteBtn.classList.remove('hidden');
  }
});
observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });


// ========================================================================================================================= //