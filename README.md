# CookTogether

## 🛠 Tech Stack

- **Pear** – Desktop app wrapper  
- **Corestore** – Log-based storage system  
- **Hyperswarm** – P2P networking  
- **Tailwind CSS** – Styling  
- **brittle** – Testing  
- **crypto** – Peer ID generation

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

