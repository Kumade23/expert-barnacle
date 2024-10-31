# Usa una versione di Node come base
FROM node:18

# Imposta la directory di lavoro
WORKDIR /app

# Copia i file di progetto
COPY . .

# Installa le dipendenze
RUN npm install

# Espone la porta 3000
EXPOSE 3000

# Comando per avviare il server
CMD ["node", "server.js"]
