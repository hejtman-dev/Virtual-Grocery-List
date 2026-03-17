// ==================== FIREBASE CONFIG ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { firebaseConfig } from './config.js';

// const firebaseConfig = {
  //   apiKey: "AIzaSyDbCBps9zR1H-bdJJe18hXD-KMi056GKDY",
  //   authDomain: "kosik-neo.firebaseapp.com",
  //   projectId: "kosik-neo",
  //   storageBucket: "kosik-neo.firebasestorage.app",
  //   messagingSenderId: "293838446545",
  //   appId: "1:293838446545:web:157728e14b564ced6e4af0",
  //   databaseURL: "https://kosik-neo-default-rtdb.europe-west1.firebasedatabase.app",
  //   measurementId: "G-7542Z2TVPZ"
  // };
  
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ==================== CONSTANTS ====================

const SHOPS = { 
  generic: 'Ostatní',
  albert: 'Albert',
  globus: 'Globus',
  kaufland: 'Kaufland',
  lidl: 'Lidl',
  penny: 'Penny',
  oc: 'Obchodní centrum',
  drogerie: 'Drogérie',
  lekarna: 'Lékárna'
};

const PRIORITIES = {
  neutral: '-',
  low: '!',
  mid: '!!',
  high: '!!!'
};

const PRIORITY_WEIGHTS = {
  high: 3,
  mid: 2,
  low: 1,
  neutral: 0
};

const LOCATIONS = {
  olomouc: 'Olomouc',
  ostrava: 'Ostrava',
  strakonice: 'Strakonice'
};

// ==================== MAIN CLASS ====================

class ShoppingListApp {
  constructor() {
    this.userId = "rodinny_kosik"; // Společné ID pro celou rodinu
    this.locationStorageKey = 'shopping_list_last_location';
    this.autocompleteStorageKey = 'shopping_list_autocomplete';
    this.currentLocation = 'olomouc';
    this.openedAccordions = new Set();
    this.items = []; 
    this.isInitialized = false;
    this.initializeApp();
  }

  //////////////////// [ UTILS ] ////////////////////
  
  async showAlert(header, message, buttons) {
    const alert = document.createElement('ion-alert');
    alert.header = header;
    alert.message = message;
    alert.buttons = Array.isArray(buttons) ? buttons : [buttons];
    document.body.appendChild(alert);
    await alert.present();
    return alert;
  }

  async showConfirmAlert(header, message, onConfirm) {
    const buttons = [
      { text: 'Zrušit', role: 'cancel' },
      { text: 'Potvrdit', role: 'confirm', handler: () => onConfirm() }
    ];
    await this.showAlert(header, message, buttons);
  }

  async showToast(message, color = 'success', duration = 2000) {
    const toast = document.createElement('ion-toast');
    toast.message = message;
    toast.duration = duration;
    toast.color = color;
    toast.position = 'top';
    document.body.appendChild(toast);
    await toast.present();
  }

  async detectLocation() {
    const savedLocation = localStorage.getItem(this.locationStorageKey);
    if (savedLocation && LOCATIONS[savedLocation]) {
      this.currentLocation = savedLocation;
      return;
    }
    this.currentLocation = 'olomouc';
  }

  saveCurrentLocation() {
    localStorage.setItem(this.locationStorageKey, this.currentLocation);
    this.updateAllLocationSelects();
  }

  //////////////////// [ FIREBASE DATA ] ////////////////////

  async syncDataFromFirebase() {
    try {
      const snapshot = await get(ref(db, `users/${this.userId}/items`));
      this.items = snapshot.exists() ? snapshot.val() : [];
      return this.items;
    } catch (error) {
      console.error('Chyba při načítání:', error);
      return [];
    }
  }

  async saveDataToFirebase(items) {
    try {
      await set(ref(db, `users/${this.userId}/items`), items);
      this.items = items;
    } catch (error) {
      this.showToast('Chyba při ukládání', 'danger');
    }
  }

  setupRealtimeListener() {
    const itemsRef = ref(db, `users/${this.userId}/items`);
    onValue(itemsRef, (snapshot) => {
      this.items = snapshot.exists() ? snapshot.val() : [];
      this.render();
    });
  }

  //////////////////// [ LOGIC ] ////////////////////

  async addItem(name, shop, priority) {
    if (!name.trim()) {
      this.showAlert('Chyba', 'Zadejte název položky', ['OK']);
      return;
    }

    const newItem = {
      id: Date.now().toString(36),
      name: name.trim(),
      shop,
      priority,
      location: this.currentLocation,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    this.items.push(newItem);
    await this.saveDataToFirebase(this.items);
    document.getElementById('input-item-name').value = '';
    this.showToast(`Přidáno!`);
  }

  async completeItem(id) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.status = 'completed';
      item.completedAt = new Date().toISOString();
      await this.saveDataToFirebase(this.items);
      this.showToast(`${item.name} odebrán z košíku`, 'success');
    }
  }

  async restoreItem(id) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.status = 'active';
      item.completedAt = null;
      await this.saveDataToFirebase(this.items);
      this.showToast(`${item.name} obnoven`, 'success');
    }
  }

  async deleteItem(id) {
    this.items = this.items.filter(i => i.id !== id);
    await this.saveDataToFirebase(this.items);
    this.showToast('Smazano z historie', 'danger');
  }

  async deleteShopItems(shopKey) {
    const itemsToMove = this.items.filter(i => i.shop === shopKey && i.location === this.currentLocation && i.status === 'active');
    if (itemsToMove.length === 0) return;

    this.showConfirmAlert('Smazat sekci', `Přesunout ${SHOPS[shopKey]} do historie?`, async () => {
      itemsToMove.forEach(item => {
        item.status = 'completed';
        item.completedAt = new Date().toISOString();
      });
      await this.saveDataToFirebase(this.items);
      this.openedAccordions.delete(shopKey);
      this.showToast('Vše odebráno ze sekce', 'success');
    });
  }

  //////////////////// [ RENDERING ] ////////////////////

  updateAllLocationSelects() {
    const selects = document.querySelectorAll('.global-location-select');
    selects.forEach(select => select.value = this.currentLocation);
  }

  render() {
    this.renderCart();
    this.renderHistory();
  }

  renderCart() {
    const container = document.getElementById('accordion-cart');
    if (!container) return;
    container.innerHTML = '';

    const activeItems = this.items.filter(i => i.status === 'active' && i.location === this.currentLocation);
    document.getElementById('badge-cart-total').textContent = activeItems.length;

    if (activeItems.length === 0) {
      container.innerHTML = `<ion-item lines="none"><ion-label color="medium" class="ion-text-center">V lokaci ${LOCATIONS[this.currentLocation]} nic není</ion-label></ion-item>`;
      return;
    }

    Object.keys(SHOPS).forEach(shopKey => {
      // FILTROVÁNÍ A ŘAZENÍ PODLE PRIORITY
      const shopItems = activeItems
        .filter(i => i.shop === shopKey)
        .sort((a, b) => PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority]);

      if (shopItems.length === 0) return;

      const accordion = document.createElement('ion-accordion');
      accordion.value = shopKey;
      if (this.openedAccordions.has(shopKey)) accordion.setAttribute('expanded', 'true');

      accordion.innerHTML = `
        <ion-item slot="header" color="light">
          <ion-label><strong>${SHOPS[shopKey]}</strong></ion-label>
          <div slot="end" style="display: flex; gap: 10px; align-items: center;">
            <ion-badge color="primary">${shopItems.length}</ion-badge>
            <ion-button size="small" color="danger" fill="clear" onclick="app.deleteShopItems('${shopKey}')">
              <ion-icon name="trash-outline" slot="icon-only"></ion-icon>
            </ion-button>
          </div>
        </ion-item>
        <div slot="content">
          <ion-list lines="full">
            ${shopItems.map(item => `
              <ion-item-sliding>
                <ion-item class="priority-${item.priority}">
                  <ion-label>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span>${item.name}</span>
                      <ion-note color="${item.priority === 'high' ? 'danger' : 'medium'}" style="font-size: 0.8rem;">
                        ${PRIORITIES[item.priority]}
                      </ion-note>
                    </div>
                  </ion-label>
                </ion-item>
                <ion-item-options side="end">
                  <ion-item-option color="success" onclick="app.completeItem('${item.id}')">
                    <ion-icon name="checkmark-outline" slot="icon-only"></ion-icon>
                  </ion-item-option>
                </ion-item-options>
              </ion-item-sliding>
            `).join('')}
          </ion-list>
        </div>
      `;
      container.appendChild(accordion);
    });
  }

  renderHistory() {
    const container = document.getElementById('accordion-history');
    if (!container) return;
    container.innerHTML = '';

    const historyItems = this.items.filter(i => i.status === 'completed' && i.location === this.currentLocation);
    if (historyItems.length === 0) {
      container.innerHTML = `<p class="ion-text-center" style="color: #999;">Historie prázdná</p>`;
      return;
    }

    const list = document.createElement('ion-list');
    list.innerHTML = historyItems.map(item => `
      <ion-item-sliding>
        <ion-item-options side="start">
          <ion-item-option color="primary" onclick="app.restoreItem('${item.id}')">
            <ion-icon name="refresh-outline" slot="icon-only"></ion-icon>
          </ion-item-option>
        </ion-item-options>
        <ion-item>
          <ion-label style="text-decoration: line-through; opacity: 0.6;">
            ${item.name}
            <p>${new Date(item.completedAt).toLocaleDateString()}</p>
          </ion-label>
        </ion-item>
        <ion-item-options side="end">
          <ion-item-option color="danger" onclick="app.deleteItem('${item.id}')">
            <ion-icon name="trash-outline" slot="icon-only"></ion-icon>
          </ion-item-option>
        </ion-item-options>
      </ion-item-sliding>
    `).join('');
    container.appendChild(list);
  }

  //////////////////// [ INIT ] ////////////////////

  async initializeApp() {
    await this.syncDataFromFirebase();
    this.setupRealtimeListener();
    await this.detectLocation();

    // Event Listeners
    const locSelects = document.querySelectorAll('.global-location-select');
    locSelects.forEach(select => {
      select.value = this.currentLocation;
      select.addEventListener('ionChange', (ev) => {
        this.currentLocation = ev.detail.value;
        this.saveCurrentLocation();
        this.render();
      });
    });

    document.getElementById('btn-add-item')?.addEventListener('click', () => {
      const name = document.getElementById('input-item-name').value;
      const shop = document.getElementById('select-shop').value;
      const priority = document.getElementById('select-priority').value;
      this.addItem(name, shop, priority);
    });

    document.getElementById('btn-delete-history')?.addEventListener('click', async () => {
      await this.showConfirmAlert('Smazat historii', `Opravdu smazat historii pro ${LOCATIONS[this.currentLocation]}?`, async () => {
        this.items = this.items.filter(i => !(i.location === this.currentLocation && i.status === 'completed'));
        await this.saveDataToFirebase(this.items);
        this.showToast('Historie smazána', 'danger');
      });
    });

    document.getElementById('btn-delete-all')?.addEventListener('click', async () => {
      // Najdeme položky k odstranění (jen aktivní v aktuální lokaci)
      const itemsToDelete = this.items.filter(i => i.location === this.currentLocation && i.status === 'active');
      
      if (itemsToDelete.length === 0) {
        this.showToast('Košík je už prázdný', 'warning');
        return;
      }

      // Použijeme tvůj připravený alert v HTML nebo zavoláme confirm
      await this.showConfirmAlert(
        'Smazat vše', 
        `Opravdu chcete hromadně přesunout všechny položky z lokace ${LOCATIONS[this.currentLocation]} do historie?`, 
        async () => {
          this.items.forEach(item => {
            if (item.location === this.currentLocation && item.status === 'active') {
              item.status = 'completed';
              item.completedAt = new Date().toISOString();
            }
          });
          await this.saveDataToFirebase(this.items);
          this.showToast('Vše přesunuto do historie');
        }
      );
    });

    // Sledování otevřených accordionů
    document.getElementById('accordion-cart')?.addEventListener('ionChange', (ev) => {
      if (ev.detail.value) this.openedAccordions.add(ev.detail.value);
      else this.openedAccordions.delete(ev.detail.value);
    });

    this.isInitialized = true;
    this.render();
  }
}

const app = new ShoppingListApp();
window.app = app;