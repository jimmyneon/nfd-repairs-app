import Link from 'next/link'
import { Wrench, Shield, Clock, CheckCircle } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background-light to-white">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Wrench className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-gray-900">NFD Repairs</span>
            </div>
            <Link href="/auth/login" className="btn-primary">
              Track My Repair
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Track Your Device Repair
          </h1>
          <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
            Stay updated on your repair status with real-time notifications and secure access to your repair information.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/login" className="btn-primary text-lg">
              Access My Repair
            </Link>
            <a href="https://newforestdevicerepairs.co.uk" className="btn-secondary text-lg">
              Visit Main Site
            </a>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="card text-center">
              <div className="flex justify-center mb-4">
                <Clock className="h-12 w-12 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Real-Time Updates</h3>
              <p className="text-gray-600">
                Get instant notifications as your repair progresses through each stage.
              </p>
            </div>
            
            <div className="card text-center">
              <div className="flex justify-center mb-4">
                <Shield className="h-12 w-12 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Secure Access</h3>
              <p className="text-gray-600">
                Magic link authentication keeps your repair information safe and private.
              </p>
            </div>
            
            <div className="card text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Warranty Tracking</h3>
              <p className="text-gray-600">
                View warranty information and report any issues with your repair.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 text-white mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <p className="text-gray-400">
              © {new Date().getFullYear()} New Forest Device Repairs. All rights reserved.
            </p>
            <div className="mt-4 space-x-6">
              <a href="https://newforestdevicerepairs.co.uk" className="text-gray-400 hover:text-white transition-colors">
                Main Website
              </a>
              <a href="tel:07410381247" className="text-gray-400 hover:text-white transition-colors">
                07410 381247
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
