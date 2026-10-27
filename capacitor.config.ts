import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
appId: 'com.nyagocargo.customer',
appName: 'Nyago Cargo Customer',
webDir: 'dist',
server: {
androidScheme: 'https'
}
};

export default config;
