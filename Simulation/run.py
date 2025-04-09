import random
import simpy
import json
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import datetime

class Product:
    def __init__(self, product_id):
        self.id = product_id

class Workstation:
    def __init__(self, env: simpy.Environment, id, failure_rate, work_time_mean, fix_time_mean, defect_rate):
        self.env = env
        self.name = id
        self.failure_rate = failure_rate
        self.work_time_mean = work_time_mean
        self.fix_time_mean = fix_time_mean
        self.defect_rate = defect_rate
        self.working = True
        self.material = 40  # (2) Cada contenedor tiene 25 unidades de material.
        self.processed_count = 0
        self.total_fix_time = 0
        self.occupancy = 0
        self.downtime = 0
        self.supply_material = SupplyMaterial(env)

    def process_product(self, product):
        """Processes a product, checks for failure, and handles repairs if needed."""

        if self.material <= 0:
            yield self.env.process(self.supply_material.supply(self))

        if random.random() < self.failure_rate:  # (4) Si una estación falla, debe repararse antes de continuar.
            fix_time = random.expovariate(1 / self.fix_time_mean)
            self.total_fix_time += fix_time
            self.downtime += fix_time
            yield self.env.timeout(fix_time)  # Simulando tiempo de reparación.

        process_time = abs(random.normalvariate(self.work_time_mean, 0.2))
        self.occupancy += process_time
        yield self.env.timeout(process_time)  # Simulando trabajo.
        self.processed_count += 1
        self.material -= 1

        # (7) Cada producto tiene una probabilidad de ser defectuoso después de ser procesado.
        if random.random() < self.defect_rate:
            return False  # Producto defectuoso.
        return True  # Producto aprobado.


class SupplyMaterial:
    def __init__(self, env: simpy.Environment):
        self.env = env
        self.supply_devices = simpy.Resource(env, capacity=3)
        self.supply_time = 0
        self.occupancy = 0

    def supply(self, workstation: Workstation):
        """Resupplies a workstation with material."""
        with self.supply_devices.request() as request:
            yield request  # Esperar disponibilidad del recurso.
            supply_time = abs(random.normalvariate(2, 0.2))
            self.occupancy += supply_time
            yield self.env.timeout(supply_time)  # Simulando tiempo de suministro.
            workstation.material = 40  # (3) Si una estación se queda sin material, debe reabastecerse.

class Factory:
    
    def __init__(self, env: simpy.Environment, num_workstations, failure_rates, work_time_mean, fix_time_mean, defect_rate):
        self.env = env
        self.workstations = [
            Workstation(env, i + 1, failure_rates[i], work_time_mean, fix_time_mean, defect_rate)
            for i in range(num_workstations)]
        self.products = []
        self.rejected_products = 0
        self.total_processing_time = 0
        self.accidents = 0
        self.downtime = 0
        self.simulation_running = True

        

        

    def run_simulation(self, time_limit):
        self.simulation = self.env.process(self.generate_products())
        self.timeLimit = time_limit
        self.env.run(until=time_limit)

        final_production = len(self.products) - self.rejected_products
        avg_fix_time = sum(ws.total_fix_time for ws in self.workstations)
        avg_bottleneck_delay = self.calculate_bottleneck_delay()
        supply_material_occupancy = sum(ws.supply_material.occupancy for ws in self.workstations)

        results = {
            "Final production": final_production,
            "Rejected productions": self.rejected_products,
            "Total fix time": avg_fix_time,
            "Average bottleneck delay": avg_bottleneck_delay,
            "Workstations occupancy": self.get_workstations_occupancy(),
            "Supplier occupancy": supply_material_occupancy,
            "Workstation downtime": self.get_workstation_downtime(),
            "Faulty Products Rate": self.rejected_products / (1 if len(self.products) == 0 else len(self.products))
        }
        return results

    def process_product_through_workstations(self, product):
        selectedProduct = 1

        """Moves a product through all 6 workstations, handling failures and supply needs."""
        
        randomChoice = random.choice([3, 4])

        # Bucle para pasar por todas las estaciones
        for i in range(len(self.workstations)):
        
            station = self.workstations[i]

            if i == 3:
                station = self.workstations[randomChoice]
            elif i == 4:
                if randomChoice == 3:
                    station = self.workstations[4]
                else:
                    station = self.workstations[3]
            
            # Ejecutar el proceso de la estación y esperar el resultado
            # print(f"procesando producto {product.id} en la estación {station.name}")
            result = yield self.env.process(station.process_product(product))

            if not self.simulation_running:
                break

            # Si el producto es defectuoso, se cuenta como rechazado.
            if not result:  
                self.rejected_products += 1
                return  # Detener el proceso si el producto es defectuoso

                
    def generate_products(self):
        """Generates products at the start and moves them through the system."""
        product_id = 0
        while self.simulation_running:
            try:
                product = Product(product_id)
                product_id+=1
                self.products.append(product)
                self.env.process(self.process_product_through_workstations(product))
                self.check_for_accident()
                if env.now == self.timeLimit-1:
                    print(f"Simulation finished succesfully in time. {env.now+1}")

                yield self.env.timeout(1)  # Genera un nuevo producto cada unidad de tiempo.
                
            except simpy.Interrupt:
                print('The bank is closes at %.2f get out' % (self._env.now))
        if not self.simulation_running:
            print(f"Simulation has interrupted in time. {env.now}")

    def check_for_accident(self):
        #(10) Existe una probabilidad del 0.01% de que ocurra un accidente en la fábrica, lo que detendría la producción.
        if random.random() < 0.0001:
            self.accidents += 1
            # print("Accident occurred! Production stopped.")
            self.simulation_running = False
            
            return True
        return False

    def calculate_bottleneck_delay(self):
        bottleneck_delay = 0
        for ws in self.workstations:
            # (6) Cada estación tiene un tiempo promedio de procesamiento y reparación.
            if ws.occupancy > ws.work_time_mean * 1.2:
                bottleneck_delay += ws.occupancy - ws.work_time_mean
        return bottleneck_delay / len(self.workstations)

    def get_workstations_occupancy(self):
        return {ws.name: round(ws.occupancy, 2) for ws in self.workstations}

    def get_workstation_downtime(self):
        return {ws.name: round(ws.downtime, 2) for ws in self.workstations}


data = []
archivo = "D3/data/data.json"
days = 40
results_dict = {}
fecha_inicio = datetime.date(2025, 3, 15)

for i in range(days):
    fecha = fecha_inicio + datetime.timedelta(days=i)
    env = simpy.Environment()
    failure_rates = [0.008, 0.002, 0.02, 0.05, 0.03, 0.01]
    factory = Factory(env, num_workstations=6, failure_rates=failure_rates,
                      work_time_mean=4, fix_time_mean=3, defect_rate=0.005)
    results = factory.run_simulation(1000)
    
    entry = {
        "fecha": fecha.isoformat(),
        "resultados": results
    }
    data.append(entry)

# Guardar todo en un archivo JSON
with open(archivo, "w") as f:
    json.dump(data, f, indent=3)


import pandas as pd

# Convertir la lista de resultados en un DataFrame
df = pd.DataFrame(data)

# Obtener estadísticas descriptivas
#print(df.describe())
