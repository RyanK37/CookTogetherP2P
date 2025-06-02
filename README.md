# CookTogether

## 🛠 Tech Stack

- **Pear** – Desktop app wrapper  
- **Corestore** – Log-based storage system  
- **Hyperswarm** – P2P networking  
- **Tailwind CSS** – Styling  
- **brittle** – Testing  
- **crypto** – Peer ID generation


## 📝 Description

This is a simple peer-to-peer desktop application for creating profiles and sharing recipes.

### 📂 Working with Multiple Terminals or Split Views

If you run the app in multiple terminals using the **same folder**, you may encounter errors due to conflicts in the `corestore` path (e.g., `cooktogether-store`). To avoid this:

1. **Copy the entire project folder** and give it a new name.
2. **Delete** the `cooktogether-store` folder inside the copied project before running it again.
3. Now, you can run the copied version in a separate terminal without conflict.

This lets you simulate a second peer easily.

### ⚙️ Application Functionality

- Users can create a profile and add recipes.
- Recipes include images, descriptions, ingredients, and instructions.
- Viewers (peers) can connect using a shared key and see each other’s profiles and recipes.
- When a user changes their profile or adds a recipe, the peer's view will update in real time.
- Viewers can download recipe details as `.txt` files.
- I also wanted to update view and download counts from the peer side, but I got stuck because we're using an append-only P2P system. Since data is immutable and only appended, tracking updates like view counts is not straightforward. Still, data does sync automatically — when a peer is viewing another user's profile, any changes made by the owner will reflect on the viewer's side in real time.


## 🚀 How to Run

### 1. Clone the repository

```
git clone https://github.com/RyanK37/CookTogetherP2P/
cd CookTogetherP2P
```

### 2. Install Pear globally
Install Pear run the following command:
```
npm i -g pear
```

### 3. Initialize Pear
To complete the setup, run the pear command:
```
pear
```

### 4. Install required dependencies 
Install the main packages needed to run the app:

```
npm install corestore crypto hyperswarm
```
Or just run npm install (it was not working on my machine so).

### 5. Run the app in development mode or not

```
pear run --dev .  <or>  pear run .
```

