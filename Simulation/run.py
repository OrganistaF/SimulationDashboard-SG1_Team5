import random
import simpy
import json
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import datetime

class Product:
    def __init__(self, product_id, env):
        self.id = product_id
        self.start_time = env.now   # Registra el tiempo de creación/inicio
        self.finish_time = None     # Se asignará al finalizar el procesamiento

class Workstation:
    def __init__(self, env: simpy.Environment, id, failure_rate, work_time_mean, fix_time_mean, defect_rate):
        self.env = env
        self.name = id
        self.failure_rate = failure_rate
        self.work_time_mean = work_time_mean
        self.fix_time_mean = fix_time_mean
        self.defect_rate = defect_rate
        self.working = True
        self.material = 40  # Cada contenedor tiene 40 unidades de material.
        self.processed_count = 0
        self.total_fix_time = 0
        self.occupancy = 0
        self.downtime = 0
        self.supply_material = SupplyMaterial(env)
        self.defectProductsCount = 0

    def process_product(self):
        """Procesa un producto, comprueba fallos y, de ser necesario, gestiona las reparaciones."""
        if self.material <= 0:
            yield self.env.process(self.supply_material.supply(self))

        if random.random() < self.failure_rate:
            fix_time = abs(random.normalvariate(self.fix_time_mean, 0.5))
            

            self.total_fix_time += fix_time
            self.downtime += fix_time
            yield self.env.timeout(fix_time)  # Tiempo de reparación

        process_time = abs(random.normalvariate(self.work_time_mean, 0.2))
        self.occupancy += process_time
        yield self.env.timeout(process_time)  # Simula el tiempo de procesamiento
        self.processed_count += 1
        self.material -= 1

        # Determina si el producto es defectuoso.
        if random.random() < self.defect_rate:
            self.defectProductsCount += 1
            
            return False
        return True

class SupplyMaterial:
    def __init__(self, env: simpy.Environment):
        self.env = env
        self.supply_devices = simpy.Resource(env, capacity=3)
        self.supply_time = 0
        self.occupancy = 0
        self.supply_count = 0  # Contador de eventos de reabastecimiento

    def supply(self, workstation: Workstation):
        """Reabastece una estación de trabajo con material."""
        with self.supply_devices.request() as request:
            yield request  # Espera a que el recurso esté disponible.
            supply_time = abs(random.normalvariate(2, 0.2))
            self.occupancy += supply_time
            yield self.env.timeout(supply_time)  # Simula el tiempo de suministro.
            workstation.material = 40  # Se reabastece la estación.
            self.supply_count += 1  # Incrementa el contador de reabastecimientos.

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
        totalOcuppancy = sum(ws.occupancy for ws in self.workstations)

        results = {
            "Final production": final_production,
            "Total products generated": len(self.products),
            "Rejected productions": self.rejected_products,
            "Total fix time": avg_fix_time,
            "Average fix time per station": {ws.name: round(ws.total_fix_time / (ws.defectProductsCount if ws.defectProductsCount != 0 else 1), 2) for ws in self.workstations},
            "Average bottleneck delay": avg_bottleneck_delay,
            "Workstations occupancy": self.get_workstations_occupancy(),
            "Average workstation utilization": {ws.name: round(ws.occupancy / totalOcuppancy, 2) for ws in self.workstations},
            "Supplier occupancy time": supply_material_occupancy,
            "Workstation downtime": self.get_workstation_downtime(),
            "Faulty Products Rate": self.rejected_products / (len(self.products) if len(self.products) != 0 else 1),
            "Accidents": self.accidents,
            "Total re-supply events": self.get_total_supply_events(),
            "Average product processing time": self.calculate_average_processing_time(),
            "Processed products" : {ws.name: ws.processed_count for ws in self.workstations},
            "Deffect products pero work station": {ws.name: ws.defectProductsCount for ws in self.workstations}
        }
        return results

    def process_product_through_workstations(self, product):
        """Mueve un producto a través de todas las estaciones de trabajo manejando fallos y necesidades de suministro."""
        randomChoice = random.choice([3, 4])

        for i in range(len(self.workstations)):
            station = self.workstations[i]

            if i == 3:
                station = self.workstations[randomChoice]
            elif i == 4:
                if randomChoice == 3:
                    station = self.workstations[4]
                else:
                    station = self.workstations[3]
            
            result = yield self.env.process(station.process_product())

            if not self.simulation_running:
                break

            # Si el producto es defectuoso, se marca como rechazado y se finaliza su proceso.
            if not result:
                product.finish_time = self.env.now  # Se marca el fin del procesamiento
                self.rejected_products += 1
                return  
        
        # Producto procesado correctamente; se marca el fin del procesamiento.
        product.finish_time = self.env.now

    def generate_products(self):
        """Genera productos a intervalos regulares y los envía a procesarse por el sistema."""
        product_id = 0
        while self.simulation_running:
            try:
                product = Product(product_id, self.env)
                product_id += 1
                self.products.append(product)
                self.env.process(self.process_product_through_workstations(product))
                self.check_for_accident()
                if self.env.now == self.timeLimit - 1:
                    print(f"Simulation finished successfully in time. {self.env.now+1}")

                yield self.env.timeout(1)  # Un nuevo producto se genera cada unidad de tiempo.
                
            except simpy.Interrupt:
                print('The bank is closed at %.2f, get out' % (self.env.now))
        if not self.simulation_running:
            print(f"Simulation has interrupted in time. {self.env.now}")

    def check_for_accident(self):
        """Comprueba si ocurre un accidente que detenga la producción."""
        if random.random() < 0.0001:
            self.accidents += 1
            self.simulation_running = False
            return True
        return False

    def calculate_bottleneck_delay(self):
        bottleneck_delay = 0
        for ws in self.workstations:
            if ws.occupancy > ws.work_time_mean * 1.2:
                bottleneck_delay += ws.occupancy - ws.work_time_mean
        return bottleneck_delay / len(self.workstations)

    def get_workstations_occupancy(self):
        return {ws.name: round(ws.occupancy, 2) for ws in self.workstations}

    def get_workstation_downtime(self):
        return {ws.name: round(ws.downtime, 2) for ws in self.workstations}

    def get_total_supply_events(self):
        """Cuenta la cantidad total de eventos de reabastecimiento en todas las estaciones."""
        total_supply = sum(ws.supply_material.supply_count for ws in self.workstations)
        return total_supply

    def calculate_average_processing_time(self):
        """
        Calcula el tiempo promedio de procesamiento de los productos.
        Solo se consideran aquellos productos que hayan finalizado su procesamiento.
        """
        processing_times = [
            (prod.finish_time - prod.start_time)
            for prod in self.products if prod.finish_time is not None
        ]
        if processing_times:
            return sum(processing_times) / len(processing_times)
        return 0

data = []
archivo = "/Users/mpreciad/Desktop/Isaac/8vo semestre/Simulacion/Proyecto2/git/SimulationDashboard-SG1_Team5/D3/data/data.json"
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

# Guardar resultados en un archivo JSON
with open(archivo, "w") as f:
    json.dump(data, f, indent=3)

# Conversión de resultados a DataFrame para análisis
df = pd.DataFrame(data)
